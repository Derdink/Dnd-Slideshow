// api.js
// Functions for interacting with the server API

/**
 * Fetches images from the server API with filtering, sorting, and pagination.
 * @param {object} [options={}] - Optional parameters for filtering, sorting, and pagination.
 * @param {string} [options.search] - Search term.
 * @param {string[]} [options.tags] - Array of tag names to filter by.
 * @param {number} [options.playlistId] - Playlist ID to filter by.
 * @param {boolean} [options.includeHidden=false] - Whether to include hidden images.
 * @param {string} [options.sortKey='dateAdded'] - Field to sort by.
 * @param {string} [options.sortDir='desc'] - Sort direction ('asc' or 'desc').
 * @param {number} [options.page=1] - Page number.
 * @param {number} [options.limit=20] - Items per page.
 * @returns {Promise<{images: Array, pagination: object}>} A promise that resolves with an object containing the images array and pagination metadata.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
export async function fetchImages({ 
  page = 1, 
  limit = 100, 
  sort_by = 'dateAdded',
  sort_order = 'desc',
  filters = {} 
} = {}) {
  console.log('fetchImages called with params:', { page, limit, sort_by, sort_order, filters });
  
  // Construct query parameters
  const queryParams = new URLSearchParams({
    page,
    limit,
    sortKey: sort_by,
    sortDir: sort_order
  });

  // Add filters if they exist
  if (filters.search) queryParams.append('search', filters.search);
  if (filters.tags && filters.tags.length) queryParams.append('tags', filters.tags.join(','));
  if (filters.playlistId) queryParams.append('playlistId', filters.playlistId);
  if (filters.includeHidden) queryParams.append('includeHidden', 'true');
  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
    queryParams.append('ids', filters.ids.join(','));
  }

  console.log('API URL being called:', `/api/images?${queryParams.toString()}`);
  
  try {
    // Make API request
    const response = await fetch(`/api/images?${queryParams.toString()}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Raw API response for images:', data);
    
    if (!data.images || !Array.isArray(data.images)) {
      console.error('API response missing images array:', data);
      return { 
        images: [], 
        pagination: { 
          currentPage: page, 
          totalPages: 1, 
          totalItems: 0, 
          itemsPerPage: limit 
        }
      };
    }
    
    console.log(`Received ${data.images.length} images from API response`);
    if (data.images.length > 0) {
      console.log('Sample image object:', data.images[0]);
    }
    
    return {
      images: data.images,
      pagination: data.pagination || { 
        currentPage: page, 
        totalPages: 1, 
        totalItems: data.images.length, 
        itemsPerPage: limit 
      }
    };
  } catch (error) {
    console.error('Error fetching images:', error);
    return { 
      images: [], 
      pagination: { 
        currentPage: page, 
        totalPages: 1, 
        totalItems: 0, 
        itemsPerPage: limit 
      } 
    };
  }
}

/**
 * Fetches all tags from the server API.
 * @returns {Promise<Array>} A promise that resolves with an array of tag objects.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function fetchTags() {
    console.log('Fetching tags from API...');
    try {
        const response = await fetch('/api/tags');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const tags = await response.json();
        console.log(`✅ Successfully fetched ${tags.length} tags.`);
        return tags;
    } catch (error) {
        console.error('❌ Error fetching tags:', error);
        throw error;
    }
}

/**
 * Fetches all playlists from the server API.
 * @returns {Promise<Array>} A promise that resolves with an array of playlist objects.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function fetchPlaylists() {
    console.log('Fetching playlists from API...');
    try {
        const response = await fetch('/api/playlists');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const playlists = await response.json();
        console.log(`✅ Successfully fetched ${playlists.length} playlists.`);
        return playlists;
    } catch (error) {
        console.error('❌ Error fetching playlists:', error);
        throw error;
    }
}

/**
 * Updates the slideshow settings on the server.
 * @param {number} transitionTime - The transition time in seconds.
 * @param {string} order - The slideshow order ('random', 'alphabetical', 'groups').
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function updateSlideshowSettings(transitionTime, order) {
    console.log(`API: Updating slideshow settings - Time: ${transitionTime}, Order: ${order}`);
    try {
        const response = await fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transitionTime, order }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log('✅ API: Slideshow settings updated successfully.', result);
        return result;
    } catch (error) {
        console.error('❌ API: Error updating slideshow settings:', error);
        throw error;
    }
}

/**
 * Tells the server to start playing a slideshow based on selected tags.
 * @param {string[]} tags - An array of tag names.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function playSelectedTags(tags) {
    console.log(`API: Requesting slideshow play for tags: ${tags.join(', ')}`);
    try {
        const response = await fetch('/api/playTags', { // Endpoint needs implementation
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log('✅ API: Play tags request successful.', result);
        return result;
    } catch (error) {
        console.error('❌ API: Error playing tags:', error);
        throw error; // Rethrow or handle as needed
    }
}

/**
 * Tells the server to start playing a slideshow based on a selected playlist.
 * @param {number} playlistId - The ID of the playlist.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function playSelectedPlaylist(playlistId) {
    console.log(`API: Requesting slideshow play for playlist ID: ${playlistId}`);
    try {
        const response = await fetch('/api/playPlaylist', { // Endpoint needs implementation
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log('✅ API: Play playlist request successful.', result);
        return result;
    } catch (error) {
        console.error('❌ API: Error playing playlist:', error);
        throw error; // Rethrow or handle as needed
    }
}

/**
 * Sends a control command to the currently running slideshow on the server.
 * @param {string} action - The control action ('prev', 'next', 'togglePause', 'reset').
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function navigateSlideshow(action) {
    console.log(`API: Sending slideshow control action: ${action}`);
    try {
        const response = await fetch('/api/slideshowControl', { // Endpoint needs implementation
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log(`✅ API: Slideshow action '${action}' successful.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error performing slideshow action '${action}':`, error);
        throw error; // Rethrow or handle as needed
    }
}

/**
 * Deletes a single image by its ID.
 * @param {number} id - The ID of the image to delete.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function deleteImageById(id) {
    console.log(`API: Deleting image ID: ${id}`);
    try {
        const response = await fetch(`/api/images/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to get error message
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to delete image'}`);
        }
        const result = await response.json();
        console.log(`✅ API: Image ID ${id} deleted successfully.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error deleting image ID ${id}:`, error);
        throw error;
    }
}

/**
 * Deletes multiple images by their IDs.
 * @param {number[]} ids - An array of image IDs to delete.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function bulkDeleteImages(ids) {
    console.log(`API: Bulk deleting image IDs: ${ids.join(', ')}`);
    if (!ids || ids.length === 0) {
        console.warn('API: Bulk delete called with empty ID array.');
        return { message: 'No IDs provided for deletion.' };
    }
    try {
        const response = await fetch('/api/images', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to get error message
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to bulk delete images'}`);
        }
        const result = await response.json();
        console.log(`✅ API: Bulk delete successful for ${ids.length} IDs.`, result);
        return result;
    } catch (error) {
        console.error('❌ API: Error during bulk delete:', error);
        throw error;
    }
}

/**
 * Updates an image's details (title, description).
 * @param {number} id - The ID of the image to update.
 * @param {object} data - The data to update (e.g., { title, description }).
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function updateImage(id, data) {
    console.log(`API: Updating image ID ${id} with data:`, data);
    try {
        const response = await fetch(`/api/images/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to get error message
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to update image'}`);
        }
        const result = await response.json();
        console.log(`✅ API: Image ID ${id} updated successfully.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error updating image ID ${id}:`, error);
        throw error;
    }
}

/**
 * Tells the server to play a specific image.
 * @param {object} image - The image object (must contain url, title, description).
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function playImageAPI(image) {
    console.log(`API: Requesting play for single image: ${image.title}`);
    try {
        const response = await fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'play',
                imageUrl: image.url,
                title: image.title,
                description: image.description || '',
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log('✅ API: Play image request successful.', result);
        return result;
    } catch (error) {
        console.error('❌ API: Error playing image:', error);
        throw error;
    }
}

/**
 * Tells the server to play a selection of images.
 * @param {object[]} images - An array of image objects.
 * @param {number} speed - Slideshow speed in seconds.
 * @param {string} order - Slideshow order.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function playSelectedImagesAPI(images, speed, order) {
    console.log(`API: Requesting play for ${images.length} selected images.`);
    try {
        const response = await fetch('/api/updateSlideshow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'playSelect',
                images: images, // Send the array of image objects
                speed: speed,
                order: order,
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        console.log('✅ API: Play selected images request successful.', result);
        return result;
    } catch (error) {
        console.error('❌ API: Error playing selected images:', error);
        throw error;
    }
}

/**
 * Creates a new tag.
 * @param {string} name - The name of the tag.
 * @param {string} [color] - Optional color for the tag.
 * @returns {Promise<object>} A promise that resolves with the new tag object.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function createTag(name, color) {
    console.log(`API: Creating tag: ${name}`);
    try {
        const response = await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color }), // Send color if provided
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to create tag'}`);
        }
        const newTag = await response.json();
        console.log('✅ API: Tag created successfully.', newTag);
        return newTag;
    } catch (error) {
        console.error('❌ API: Error creating tag:', error);
        throw error;
    }
}

/**
 * Updates a tag's name.
 * @param {number} id - The ID of the tag to update.
 * @param {string} name - The new name for the tag.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function updateTag(id, name) {
    console.log(`API: Updating tag ID ${id} to name: ${name}`);
    try {
        const response = await fetch(`/api/tags/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to update tag'}`);
        }
        const result = await response.json();
        console.log(`✅ API: Tag ID ${id} updated successfully.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error updating tag ID ${id}:`, error);
        throw error;
    }
}

/**
 * Deletes a tag by its ID.
 * @param {number} id - The ID of the tag to delete.
 * @returns {Promise<object>} A promise that resolves with the server response.
 * @throws {Error} If the fetch request fails or the response is not ok.
 */
async function deleteTag(id) {
    console.log(`API: Deleting tag ID: ${id}`);
    try {
        const response = await fetch(`/api/tags/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to delete tag'}`);
        }
        const result = await response.json();
        console.log(`✅ API: Tag ID ${id} deleted successfully.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error deleting tag ID ${id}:`, error);
        throw error;
    }
}

// Playlist-specific API functions
async function updatePlaylist(playlistId, data) {
    try {
        const response = await fetch(`/api/playlists/${playlistId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Failed to update playlist: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating playlist:', error);
        throw error;
    }
}

async function deletePlaylist(playlistId) {
    try {
        const response = await fetch(`/api/playlists/${playlistId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Failed to delete playlist: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error deleting playlist:', error);
        throw error;
    }
}

async function addImagesToPlaylist(playlistId, imageIds) {
    try {
        const response = await fetch(`/api/playlists/${playlistId}/images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageIds })
        });

        if (!response.ok) {
            throw new Error(`Failed to add images to playlist: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error adding images to playlist:', error);
        throw error;
    }
}

async function removeImageFromPlaylist(playlistId, imageId) {
    try {
        const response = await fetch(`/api/playlists/${playlistId}/images/${imageId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Failed to remove image from playlist: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error removing image from playlist:', error);
        throw error;
    }
}

/**
 * Uploads a file to the server
 * @param {File} file - The file to upload
 * @param {boolean} overwrite - Whether to overwrite existing file if it exists
 * @returns {Promise<object>} A promise that resolves with the server response
 * @throws {Error} If the fetch request fails or the response is not ok
 */
async function uploadFile(file, overwrite = false) {
    console.log(`API: Uploading file: ${file.name}, overwrite: ${overwrite}`);
    try {
        const formData = new FormData();
        formData.append('file', file);
        if (overwrite) {
            formData.append('overwrite', 'true');
        }

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message || 'Failed to upload file'}`);
        }

        const result = await response.json();
        console.log(`✅ API: File "${file.name}" uploaded successfully.`, result);
        return result;
    } catch (error) {
        console.error(`❌ API: Error uploading file "${file.name}":`, error);
        throw error;
    }
}

// Export the API functions
export { fetchTags, fetchPlaylists, updateSlideshowSettings, playSelectedTags, playSelectedPlaylist, navigateSlideshow, deleteImageById, bulkDeleteImages, updateImage, playImageAPI, playSelectedImagesAPI, createTag, updateTag, deleteTag, updatePlaylist, deletePlaylist, addImagesToPlaylist, removeImageFromPlaylist, uploadFile };

console.log('api.js loaded'); // Placeholder