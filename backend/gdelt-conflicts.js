// Fixed GDELT Conflict Integration for RealNow
// No authentication required!

const axios = require('axios');

class GDELTConflictIntegration {
  constructor() {
    // GDELT Doc API for event articles
    this.docApiUrl = 'https://api.gdeltproject.org/api/v2/doc/doc';
    // GDELT Event Database API
    this.eventApiUrl = 'https://api.gdeltproject.org/api/v2/event/event';
  }

  async fetchConflicts() {
    try {
      console.log('🔍 Fetching GDELT conflict data...');
      
      // Fetch recent conflict-related articles
      const articles = await this.fetchConflictArticles();
      
      // Transform to our format
      const transformedData = this.transformGDELTData(articles);
      
      console.log(`✅ Found ${transformedData.count} conflict events`);
      return transformedData;
      
    } catch (error) {
      console.error('Error fetching GDELT data:', error);
      return { type: 'conflicts', count: 0, data: [] };
    }
  }

  async fetchConflictArticles() {
    try {
      // GDELT Doc API returns JSON with articles about conflicts
      const queries = [
        'conflict OR violence OR attack OR bombing',
        'protest OR demonstration OR riot',
        'military action OR armed conflict'
      ];
      
      const allArticles = [];
      
      for (const query of queries) {
        console.log(`  Searching for: ${query}`);
        
        const params = {
          query: query,
          mode: 'ArtList',      // Article list mode
          maxrecords: 250,      // Max records
          timespan: '3d',       // Last 3 days
          format: 'json',       // JSON format
          sort: 'DateDesc'      // Sort by date descending
        };
        
        const response = await axios.get(this.docApiUrl, { params });
        
        if (response.data && response.data.articles) {
          console.log(`  Found ${response.data.articles.length} articles`);
          allArticles.push(...response.data.articles);
        }
      }
      
      // Deduplicate by URL
      const uniqueArticles = Array.from(
        new Map(allArticles.map(article => [article.url, article])).values()
      );
      
      return uniqueArticles;
      
    } catch (error) {
      console.error('Error fetching articles:', error.message);
      return [];
    }
  }

  transformGDELTData(articles) {
    // Extract location data from articles and create conflict events
    const events = [];
    const processedLocations = new Set();
    
    articles.forEach((article, index) => {
      // Skip if no title or URL
      if (!article.title || !article.url) return;
      
      // Extract locations from the article title and snippet
      const text = `${article.title} ${article.seendate || ''}`;
      const locations = this.extractLocations(text);
      
      // Create an event for each unique location mentioned
      locations.forEach(location => {
        const locationKey = `${location.name}-${article.domain}`;
        
        // Avoid duplicate locations from same source
        if (!processedLocations.has(locationKey)) {
          processedLocations.add(locationKey);
          
          events.push({
            id: `gdelt-${Date.now()}-${index}-${events.length}`,
            type: 'conflict',
            category: this.categorizeEvent(article.title),
            location: {
              latitude: location.lat || this.getApproximateCoordinates(location.name).lat,
              longitude: location.lng || this.getApproximateCoordinates(location.name).lng,
              locality: location.name,
              country: this.extractCountry(text) || location.country
            },
            description: article.title,
            date: article.seendate || new Date().toISOString(),
            severity: this.calculateSeverity(article.title),
            source: article.domain,
            sourceUrl: article.url,
            socialimage: article.socialimage || null,
            sourcecountry: article.sourcecountry || null
          });
        }
      });
    });
    
    // If no location-specific events, create general events from articles
    if (events.length === 0 && articles.length > 0) {
      articles.slice(0, 50).forEach((article, index) => {
        if (!article.title) return;
        
        events.push({
          id: `gdelt-general-${Date.now()}-${index}`,
          type: 'conflict',
          category: this.categorizeEvent(article.title),
          location: {
            // Use source country if available, otherwise unknown
            latitude: article.sourcecountry ? this.getCountryCoordinates(article.sourcecountry).lat : 0,
            longitude: article.sourcecountry ? this.getCountryCoordinates(article.sourcecountry).lng : 0,
            locality: article.sourcecountry || 'Unknown',
            country: article.sourcecountry || 'Unknown'
          },
          description: article.title,
          date: article.seendate || new Date().toISOString(),
          severity: this.calculateSeverity(article.title),
          source: article.domain,
          sourceUrl: article.url,
          socialimage: article.socialimage || null
        });
      });
    }
    
    return {
      type: 'conflicts',
      count: events.length,
      lastUpdated: new Date().toISOString(),
      data: events
    };
  }

  extractLocations(text) {
    const locations = [];
    
    // Common location patterns
    const patterns = [
      /in ([A-Z][a-zA-Z\s]+(?:,\s*[A-Z][a-zA-Z\s]+)?)/g,
      /(?:at|near|outside)\s+([A-Z][a-zA-Z\s]+)/g,
      /([A-Z][a-zA-Z\s]+)(?:\s+attack|\s+protest|\s+conflict)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const location = match[1].trim();
        // Filter out common non-location words
        if (!this.isCommonWord(location) && location.length > 2) {
          locations.push({ name: location });
        }
      }
    });
    
    // Also check for country names
    const countries = this.getCountryList();
    countries.forEach(country => {
      if (text.includes(country)) {
        locations.push({ 
          name: country, 
          country: country,
          ...this.getCountryCoordinates(country)
        });
      }
    });
    
    return locations;
  }

  extractCountry(text) {
    const countries = this.getCountryList();
    for (const country of countries) {
      if (text.includes(country)) {
        return country;
      }
    }
    return null;
  }

  isCommonWord(word) {
    const commonWords = [
      'The', 'This', 'That', 'These', 'Those', 'Monday', 'Tuesday', 'Wednesday', 
      'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March',
      'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
      'December', 'Police', 'Forces', 'Military', 'Government'
    ];
    return commonWords.includes(word);
  }

  categorizeEvent(title) {
    const lower = title.toLowerCase();
    
    if (lower.includes('protest') || lower.includes('demonstrat')) {
      return 'Protest';
    } else if (lower.includes('bomb') || lower.includes('explos')) {
      return 'Explosion';
    } else if (lower.includes('attack') || lower.includes('assault')) {
      return 'Attack';
    } else if (lower.includes('riot') || lower.includes('unrest')) {
      return 'Civil Unrest';
    } else if (lower.includes('military') || lower.includes('armed')) {
      return 'Military Activity';
    } else if (lower.includes('kill') || lower.includes('dead')) {
      return 'Violence';
    } else {
      return 'Conflict';
    }
  }

  calculateSeverity(title) {
    const lower = title.toLowerCase();
    let severity = 1;
    
    // Increase severity based on keywords
    if (lower.includes('kill') || lower.includes('dead') || lower.includes('death')) severity = 5;
    else if (lower.includes('bomb') || lower.includes('explos')) severity = 5;
    else if (lower.includes('injur') || lower.includes('wound') || lower.includes('hurt')) severity = 4;
    else if (lower.includes('attack') || lower.includes('assault')) severity = 4;
    else if (lower.includes('riot') || lower.includes('clash')) severity = 3;
    else if (lower.includes('protest') || lower.includes('demonstrat')) severity = 2;
    
    // Check for casualty numbers
    const casualtyMatch = title.match(/(\d+)\s*(?:killed|dead|died|casualties)/i);
    if (casualtyMatch) {
      const casualties = parseInt(casualtyMatch[1]);
      if (casualties > 10) severity = 5;
      else if (casualties > 5) severity = 4;
    }
    
    return severity;
  }

  getCountryList() {
    // Top conflict-prone countries for better detection
    return [
      'Ukraine', 'Russia', 'Israel', 'Palestine', 'Gaza', 'Syria', 'Afghanistan',
      'Iraq', 'Yemen', 'Somalia', 'Sudan', 'Ethiopia', 'Nigeria', 'Mali',
      'Myanmar', 'Pakistan', 'India', 'China', 'Iran', 'Lebanon', 'Libya',
      'Egypt', 'Turkey', 'Mexico', 'Colombia', 'Venezuela', 'Haiti'
    ];
  }

  getCountryCoordinates(country) {
    const coordinates = {
      'Ukraine': { lat: 48.3794, lng: 31.1656 },
      'Russia': { lat: 61.5240, lng: 105.3188 },
      'Israel': { lat: 31.0461, lng: 34.8516 },
      'Palestine': { lat: 31.9474, lng: 35.2272 },
      'Gaza': { lat: 31.3547, lng: 34.3088 },
      'Syria': { lat: 34.8021, lng: 38.9968 },
      'Afghanistan': { lat: 33.9391, lng: 67.7100 },
      'Iraq': { lat: 33.2232, lng: 43.6793 },
      'Yemen': { lat: 15.5527, lng: 48.5164 },
      'Somalia': { lat: 5.1521, lng: 46.1996 },
      'Sudan': { lat: 12.8628, lng: 30.2176 },
      'Ethiopia': { lat: 9.1450, lng: 40.4897 },
      'Nigeria': { lat: 9.0820, lng: 8.6753 },
      'Mali': { lat: 17.5707, lng: -3.9962 },
      'Myanmar': { lat: 21.9162, lng: 95.9560 },
      'Pakistan': { lat: 30.3753, lng: 69.3451 },
      'India': { lat: 20.5937, lng: 78.9629 },
      'China': { lat: 35.8617, lng: 104.1954 },
      'Iran': { lat: 32.4279, lng: 53.6880 },
      'Lebanon': { lat: 33.8547, lng: 35.8623 },
      'Libya': { lat: 26.3351, lng: 17.2283 },
      'Egypt': { lat: 26.8206, lng: 30.8025 },
      'Turkey': { lat: 38.9637, lng: 35.2433 },
      'Mexico': { lat: 23.6345, lng: -102.5528 },
      'Colombia': { lat: 4.5709, lng: -74.2973 },
      'Venezuela': { lat: 6.4238, lng: -66.5897 },
      'Haiti': { lat: 18.9712, lng: -72.2852 }
    };
    
    return coordinates[country] || { lat: 0, lng: 0 };
  }

  getApproximateCoordinates(location) {
    // For unknown locations, return random coordinates within reasonable bounds
    // In production, you'd want to use a geocoding service
    return {
      lat: Math.random() * 160 - 80,  // -80 to 80
      lng: Math.random() * 360 - 180  // -180 to 180
    };
  }
}

// Test the integration
if (require.main === module) {
  const gdelt = new GDELTConflictIntegration();
  gdelt.fetchConflicts().then(result => {
    console.log(`\n✅ Fetched ${result.count} conflict events`);
    console.log('\n📊 Sample events:');
    result.data.slice(0, 5).forEach(event => {
      console.log(`\n- ${event.category}: ${event.description}`);
      console.log(`  📍 Location: ${event.location.locality} (${event.location.latitude.toFixed(2)}, ${event.location.longitude.toFixed(2)})`);
      console.log(`  ⚠️  Severity: ${event.severity}/5`);
      console.log(`  📅 Date: ${new Date(event.date).toLocaleDateString()}`);
      console.log(`  🔗 Source: ${event.source}`);
    });
    
    // Show category breakdown
    const categories = {};
    result.data.forEach(event => {
      categories[event.category] = (categories[event.category] || 0) + 1;
    });
    
    console.log('\n📈 Event Categories:');
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} events`);
    });
  }).catch(console.error);
}

module.exports = GDELTConflictIntegration;