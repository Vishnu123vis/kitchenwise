import axios from 'axios';

interface PexelsPhoto {
  id: number;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

export class PexelsService {
  private apiKey: string;
  private baseURL = 'https://api.pexels.com/v1';

  constructor() {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      throw new Error('PEXELS_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async searchImage(query: string): Promise<string | null> {
    try {
      const response = await axios.get<PexelsSearchResponse>(
        `${this.baseURL}/search`,
        {
          params: {
            query: query,
            per_page: 1,
            orientation: 'landscape'
          },
          headers: {
            'Authorization': this.apiKey
          },
          timeout: 10000 // 10 second timeout
        }
      );

      const photos = response.data.photos;
      if (photos && photos.length > 0) {
        // Return the large2x image for good quality
        return photos[0].src.large2x;
      }

      return null;
    } catch (error) {
      console.error('Pexels API error:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          console.warn('Pexels rate limit exceeded, returning null');
          return null;
        }
        if (error.response?.status === 401) {
          console.error('Invalid Pexels API key');
          return null;
        }
        if (error.response?.status === 400) {
          console.error('Invalid request to Pexels API');
          return null;
        }
      }
      
      console.error('Failed to search Pexels for image');
      return null;
    }
  }

  async searchRecipeImage(recipeTitle: string): Promise<string | null> {
    // Clean the recipe title for better search results
    const searchQuery = this.cleanRecipeTitle(recipeTitle);
    
    // Try with the full recipe title first
    let imageUrl = await this.searchImage(searchQuery);
    
    // If no results, try with just the main ingredient or dish type
    if (!imageUrl) {
      const simplifiedQuery = this.extractMainIngredient(recipeTitle);
      if (simplifiedQuery && simplifiedQuery !== searchQuery) {
        imageUrl = await this.searchImage(simplifiedQuery);
      }
    }
    
    return imageUrl;
  }

  private cleanRecipeTitle(title: string): string {
    // Remove common recipe words and clean up the title
    return title
      .replace(/\b(recipe|dish|meal|food|cooking|kitchen)\b/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractMainIngredient(title: string): string {
    // Extract the main ingredient or dish type from the title
    const words = title.toLowerCase().split(' ');
    
    // Common main ingredients/dish types
    const mainIngredients = [
      'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'pasta', 
      'rice', 'quinoa', 'salad', 'soup', 'stew', 'curry', 'stir-fry',
      'pizza', 'burger', 'sandwich', 'taco', 'burrito', 'lasagna',
      'pasta', 'noodles', 'bread', 'cake', 'cookie', 'pie', 'smoothie'
    ];
    
    for (const word of words) {
      if (mainIngredients.includes(word)) {
        return word;
      }
    }
    
    // If no main ingredient found, return the first significant word
    const significantWords = words.filter(word => 
      word.length > 3 && !['with', 'and', 'the', 'for', 'from'].includes(word)
    );
    
    return significantWords[0] || '';
  }
} 