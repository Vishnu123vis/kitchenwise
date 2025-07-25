import { APIGatewayProxyHandler } from 'aws-lambda';
import DynamoDB from '../../libs/DynamoDB';
import { httpResponse } from '../../libs/APIResponses';
import { PantryItemRecord, PantryItemType, PantryLocation } from '../../types/dyno';

interface DashboardStats {
  overview: {
    totalItems: number;
    uniqueItems: number;
    averageItemsPerLocation: number;
    mostPopulatedLocation: string;
  };
  locationBreakdown: Record<PantryLocation, number>;
  typeBreakdown: Record<PantryItemType, number>;
  expiryAlerts: {
    urgent: number;      // Items expiring within 7 days
    warning: number;     // Items expiring within 14 days
    notice: number;      // Items expiring within 30 days
    expired: number;     // Items that have already expired
  };
  inventoryInsights: {
    lowStockItems: number;    // Items with count <= 2
    highStockItems: number;   // Items with count >= 5
    mostCommonType: string;
  };
}

// Helper function to calculate days between dates
const getDaysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Helper function to get items expiring within a date range
const getItemsExpiringInRange = (items: PantryItemRecord[], startDays: number, endDays: number): PantryItemRecord[] => {
  const today = new Date().toISOString().split('T')[0];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + startDays);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + endDays);
  
  return items.filter(item => {
    const expiryDate = new Date(item.expiryDate);
    return expiryDate >= startDate && expiryDate <= endDate;
  });
};

// Helper function to get expired items
const getExpiredItems = (items: PantryItemRecord[]): PantryItemRecord[] => {
  const today = new Date().toISOString().split('T')[0];
  return items.filter(item => item.expiryDate < today);
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return httpResponse({ statusCode: 401, body: { error: 'Unauthorized' } });
    }

    const tableName = process.env.DYNAMODB_PANTRY_TABLE;
    if (!tableName) {
      console.error('DYNAMODB_PANTRY_TABLE environment variable not set');
      return httpResponse({ statusCode: 500, body: { error: 'Configuration error' } });
    }

    // Get all items for the user
    const { items } = await DynamoDB.queryItems<PantryItemRecord>({
      TableName: tableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    });

    // Calculate overview stats
    const totalItems = items.reduce((sum, item) => sum + item.count, 0);
    const uniqueItems = items.length;
    const locationCounts = items.reduce((acc, item) => {
      acc[item.location] = (acc[item.location] || 0) + item.count;
      return acc;
    }, {} as Record<string, number>);
    
    const mostPopulatedLocation = Object.entries(locationCounts)
      .reduce((max, [location, count]) => count > max.count ? { location, count } : max, { location: 'None', count: 0 })
      .location;

    // Calculate location breakdown
    const locationBreakdown: Record<PantryLocation, number> = {
      Fridge: locationCounts.Fridge || 0,
      Freezer: locationCounts.Freezer || 0,
      Pantry: locationCounts.Pantry || 0,
      Counter: locationCounts.Counter || 0,
      Other: locationCounts.Other || 0,
    };

    // Calculate type breakdown
    const typeCounts = items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + item.count;
      return acc;
    }, {} as Record<string, number>);

    const typeBreakdown: Record<PantryItemType, number> = {
      Dairy: typeCounts.Dairy || 0,
      Produce: typeCounts.Produce || 0,
      Meat: typeCounts.Meat || 0,
      Grains: typeCounts.Grains || 0,
      Snacks: typeCounts.Snacks || 0,
      Beverages: typeCounts.Beverages || 0,
      Condiments: typeCounts.Condiments || 0,
      Frozen: typeCounts.Frozen || 0,
      Other: typeCounts.Other || 0,
    };

    // Calculate expiry alerts
    const urgentItems = getItemsExpiringInRange(items, 0, 7);
    const warningItems = getItemsExpiringInRange(items, 7, 14);
    const noticeItems = getItemsExpiringInRange(items, 14, 30);
    const expiredItems = getExpiredItems(items);

    // Calculate inventory insights
    const lowStockItems = items.filter(item => item.count <= 2).length;
    const highStockItems = items.filter(item => item.count >= 5).length;
    const mostCommonType = Object.entries(typeCounts)
      .reduce((max, [type, count]) => count > max.count ? { type, count } : max, { type: 'None', count: 0 })
      .type;

    const dashboardStats: DashboardStats = {
      overview: {
        totalItems,
        uniqueItems,
        averageItemsPerLocation: Math.round(totalItems / Object.keys(locationCounts).length || 1),
        mostPopulatedLocation,
      },
      locationBreakdown,
      typeBreakdown,
      expiryAlerts: {
        urgent: urgentItems.length,
        warning: warningItems.length,
        notice: noticeItems.length,
        expired: expiredItems.length,
      },
      inventoryInsights: {
        lowStockItems,
        highStockItems,
        mostCommonType,
      },
    };

    return httpResponse({ statusCode: 200, body: dashboardStats });
    
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return httpResponse({ statusCode: 500, body: { error: 'Failed to fetch dashboard stats' } });
  }
}; 