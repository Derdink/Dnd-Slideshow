/**
 * @file main-new.js
 * @description Modular implementation of the slideshow application
 */

// Immediately-invoked Function Expression to prevent polluting global scope
(function(window, document) {
    'use strict';

    /**
     * =============================================================================
     * CORE CONFIGURATION
     * =============================================================================
     */
    const CONFIG = {
        // API endpoints
        API: {
            IMAGES: '/api/images',
            TAGS: '/api/tags',
            PLAYLISTS: '/api/playlists',
            UPLOAD: '/upload',
            SLIDESHOW: '/api/updateSlideshow',
            ENTRIES_TAGS: '/api/entries/tags'
        },
        // Default settings
        DEFAULTS: {
            TRANSITION_TIME: 3,
            ORDER: 'random',
            ITEMS_PER_PAGE: 20
        },
        // DOM element IDs and classes
        DOM: {
            SLIDESHOW: {
                CONTAINER: 'slideshow-container',
                SLIDE1: 'slide1',
                SLIDE2: 'slide2',
                TITLE1: 'title-overlay1',
                TITLE2: 'title-overlay2',
                SUBTITLE1: 'subtitle-overlay1',
                SUBTITLE2: 'subtitle-overlay2',
                LEFT_NAV: '.hover-area.left',
                RIGHT_NAV: '.hover-area.right'
            },
            MANAGEMENT: {
                SETTINGS_SECTION: 'settingsSection',
                IMAGE_TABLE: 'imageTable',
                SEARCH: 'search',
                PAGINATION: 'pagination',
                TAG_MANAGER: 'tagManagerSection',
                TAG_FILTER: 'tagFilterDropdown',
                PLAYLIST_MANAGER: 'playlistManagerSection'
            },
            MODALS: {
                EDIT_MODAL: 'editModal',
                TAG_EDIT_MODAL: 'tagEditModal',
                PLAYLIST_EDIT_MODAL: 'playlistEditModal'
            }
        },
        // Local storage keys
        STORAGE: {
            TRANSITION_TIME: 'transitionTime',
            ORDER: 'slideshowOrder',
            TAG_COLOR_INDEX: 'nextTagColorIndex'
        },
        // CSS classes
        CLASSES: {
            ACTIVE: 'active',
            SELECTED: 'selected',
            VISIBLE: 'visible',
            FADE_OUT: 'fade-out'
        },
        // Socket event names
        SOCKET: {
            SETTINGS_UPDATE: 'settingsUpdate',
            PLAY_IMAGE: 'playImage',
            PLAY_SELECT: 'playSelect',
            SLIDE_ACTION: 'slideAction',
            NAVIGATION: 'navigation'
        },
        // Background and content colors for tags
        COLORS: {
            BACKGROUNDS: [
                "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
                "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
            ],
            CONTENT: [
                "#161616", "#121619", "#171414", "#a2191f", "#9f1853", "#6929c4",
                "#0043ce", "#00539a", "#005d5d", "#0e6027", "#d91313", "#f97d3f", "#265C34"
            ]
        }
    };

    /**
     * =============================================================================
     * GLOBAL STATE MANAGEMENT
     * =============================================================================
     */
    // Create a state proxy with change notification
    const createState = (initialState = {}) => {
        // Store listeners for state change
        const listeners = new Set();

        // Create proxy to trap state changes
        const state = new Proxy(initialState, {
            set(target, property, value) {
                const oldValue = target[property];
                target[property] = value;

                // Notify listeners about the change
                if (oldValue !== value) {
                    listeners.forEach(listener =>
                        listener(property, value, oldValue)
                    );
                }
                return true;
            }
        });

        // Methods to subscribe and unsubscribe to state changes
        return {
            state,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };
    };

    // Application state
    const { state, subscribe } = createState({
        // Slideshow state
        slideshow: {
            images: [],
            selectedImages: [],
            currentIndex: 0,
            transitionTime: parseFloat(localStorage.getItem(CONFIG.STORAGE.TRANSITION_TIME)) || CONFIG.DEFAULTS.TRANSITION_TIME,
            order: localStorage.getItem(CONFIG.STORAGE.ORDER) || CONFIG.DEFAULTS.ORDER,
            interval: null,
            isPaused: false,
            usedRandomImages: new Set()
        },
        // Management interface state
        management: {
            imagesData: [],
            selectedImageIds: new Set(),
            selectedPlaylistIds: new Set(),
            currentPage: 1,
            itemsPerPage: CONFIG.DEFAULTS.ITEMS_PER_PAGE,
            totalPages: 1,
            sortKey: null,
            sortDirection: 'asc',
            selectedFilterTags: []
        },
        // Tags state
        tags: {
            items: [],
            nextColorIndex: parseInt(localStorage.getItem(CONFIG.STORAGE.TAG_COLOR_INDEX) || 0)
        },
        // Playlists state
        playlists: {
            items: []
        },
        // UI state
        ui: {
            isMobile: window.innerWidth < 768,
            isDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
            activeModals: new Set(),
            activeFilters: {
                search: '',
                tags: [],
                playlists: []
            }
        }
    });

    /**
     * =============================================================================
     * SERVICE LAYER
     * =============================================================================
     */
    const services = {
        /**
         * HTTP service for making API requests
         */
        http: {
            /**
             * Makes a fetch request with standard error handling
             * @param {string} url - API endpoint URL
             * @param {Object} options - Fetch options
             * @returns {Promise} - Resolves with JSON response or rejects with error
             */
            request: async(url, options = {}) => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            'Content-Type': 'application/json',
                            ...options.headers
                        },
                        ...options
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
                    }

                    return await response.json();
                } catch (error) {
                    errorHandler.handle(error, `API request to ${url} failed`);
                    throw error;
                }
            },

            // Shorthand methods for common HTTP verbs
            get: (url) => services.http.request(url),

            post: (url, data) => services.http.request(url, {
                method: 'POST',
                body: JSON.stringify(data)
            }),

            put: (url, data) => services.http.request(url, {
                method: 'PUT',
                body: JSON.stringify(data)
            }),

            delete: (url, data) => services.http.request(url, {
                method: 'DELETE',
                body: data ? JSON.stringify(data) : undefined
            })
        },

        /**
         * Image service for managing images
         */
        images: {
            /**
             * Fetches all images from the server
             * @returns {Promise<Array>} - Array of image objects
             */
            getAll: async() => {
                try {
                    const images = await services.http.get(CONFIG.API.IMAGES);
                    state.slideshow.images = images;
                    state.management.imagesData = images;
                    return images;
                } catch (error) {
                    errorHandler.handle(error, 'Failed to fetch images');
                    return [];
                }
            },

            /**
             * Deletes an image by ID
             * @param {number} id - Image ID to delete
             * @returns {Promise<Object>} - Response message
             */
            delete: (id) => services.http.delete(`${CONFIG.API.IMAGES}/${id}`),

            /**
             * Deletes multiple images
             * @param {Array<number>} ids - Array of image IDs to delete
             * @returns {Promise<Object>} - Response message
             */
            bulkDelete: (ids) => services.http.delete(CONFIG.API.IMAGES, { ids }),

            /**
             * Updates image properties
             * @param {number} id - Image ID
             * @param {Object} data - Properties to update
             * @returns {Promise<Object>} - Response message
             */
            update: (id, data) => services.http.put(`${CONFIG.API.IMAGES}/${id}`, data),

            /**
             * Uploads a new image
             * @param {File} file - Image file to upload
             * @param {boolean} overwrite - Whether to overwrite existing file
             * @returns {Promise<Object>} - Response message
             */
            upload: async(file, overwrite = false) => {
                try {
                    const formData = new FormData();
                    formData.append('file', file);
                    if (overwrite) {
                        formData.append('overwrite', 'true');
                    }

                    const response = await fetch(CONFIG.API.UPLOAD, {
                        method: 'POST',
                        body: formData
                    });

                    return await response.json();
                } catch (error) {
                    errorHandler.handle(error, 'Failed to upload image');
                    throw error;
                }
            }
        },

        /**
         * Tag service for managing tags
         */
        tags: {
            /**
             * Fetches all tags from the server
             * @returns {Promise<Array>} - Array of tag objects
             */
            getAll: async() => {
                try {
                    const tags = await services.http.get(CONFIG.API.TAGS);
                    state.tags.items = tags;
                    return tags;
                } catch (error) {
                    errorHandler.handle(error, 'Failed to fetch tags');
                    return [];
                }
            },

            /**
             * Creates a new tag
             * @param {string} name - Tag name
             * @param {string} color - Tag color (hex)
             * @returns {Promise<Object>} - New tag object
             */
            create: (name, color) => services.http.post(CONFIG.API.TAGS, { name, color }),

            /**
             * Deletes a tag by ID
             * @param {number} id - Tag ID
             * @returns {Promise<Object>} - Response message
             */
            delete: (id) => services.http.delete(`${CONFIG.API.TAGS}/${id}`),

            /**
             * Updates a tag
             * @param {number} id - Tag ID
             * @param {Object} data - Tag properties to update
             * @returns {Promise<Object>} - Response message
             */
            update: (id, data) => services.http.put(`${CONFIG.API.TAGS}/${id}`, data),

            /**
             * Adds a tag to multiple images
             * @param {Array<number>} imageIds - Image IDs
             * @param {string} tagName - Tag name
             * @returns {Promise<Object>} - Response message
             */
            addToImages: (imageIds, tagName) =>
                services.http.post(CONFIG.API.ENTRIES_TAGS, { ids: imageIds, tag: tagName }),

            /**
             * Removes a tag from multiple images
             * @param {Array<number>} imageIds - Image IDs
             * @param {string} tagName - Tag name
             * @returns {Promise<Object>} - Response message
             */
            removeFromImages: (imageIds, tagName) =>
                services.http.delete(CONFIG.API.ENTRIES_TAGS, { ids: imageIds, tag: tagName })
        },

        /**
         * Playlist service for managing playlists
         */
        playlists: {
            /**
             * Fetches all playlists from the server
             * @returns {Promise<Array>} - Array of playlist objects
             */
            getAll: async() => {
                try {
                    const playlists = await services.http.get(CONFIG.API.PLAYLISTS);
                    state.playlists.items = playlists;
                    return playlists;
                } catch (error) {
                    errorHandler.handle(error, 'Failed to fetch playlists');
                    return [];
                }
            },

            /**
             * Saves all playlists to the server
             * @param {Array} playlists - Array of playlist objects
             * @returns {Promise<Object>} - Response message
             */
            saveAll: (playlists) => services.http.post(CONFIG.API.PLAYLISTS, { playlists })
        },

        /**
         * Slideshow service for controlling slideshow
         */
        slideshow: {
            /**
             * Updates slideshow settings
             * @param {number} speed - Transition time in seconds
             * @param {string} order - Order mode (random, alphabetical, groups)
             * @returns {Promise<Object>} - Response message
             */
            updateSettings: (speed, order) =>
                services.http.post(CONFIG.API.SLIDESHOW, {
                    action: 'updateSettings',
                    speed,
                    order
                }),

            /**
             * Plays a specific image
             * @param {string} imageUrl - Image URL
             * @param {string} title - Image title
             * @param {string} description - Image description
             * @returns {Promise<Object>} - Response message
             */
            playImage: (imageUrl, title, description) =>
                services.http.post(CONFIG.API.SLIDESHOW, {
                    action: 'play',
                    imageUrl,
                    title,
                    description
                }),

            /**
             * Plays selected images
             * @param {Array} images - Array of image objects
             * @param {number} speed - Transition time in seconds
             * @param {string} order - Order mode
             * @returns {Promise<Object>} - Response message
             */
            playSelected: (images, speed, order) =>
                services.http.post(CONFIG.API.SLIDESHOW, {
                    action: 'playSelect',
                    images,
                    speed,
                    order
                }),

            /**
             * Triggers slideshow navigation
             * @param {string} action - 'next' or 'prev'
             * @returns {Promise<Object>} - Response message
             */
            navigate: (action) =>
                services.http.post(CONFIG.API.SLIDESHOW, { action })
        },

        /**
         * Socket service for real-time communication
         */
        socket: {
            /**
             * Emits an event to the server
             * @param {string} event - Event name
             * @param {Object} data - Event data
             */
            emit: (event, data) => {
                if (window.socket) {
                    window.socket.emit(event, data);
                } else {
                    errorHandler.handle(
                        new Error('Socket not initialized'),
                        'Cannot emit socket event'
                    );
                }
            },

            /**
             * Subscribes to a socket event
             * @param {string} event - Event name
             * @param {Function} callback - Event handler
             * @returns {Function} - Unsubscribe function
             */
            on: (event, callback) => {
                if (window.socket) {
                    window.socket.on(event, callback);
                    return () => window.socket.off(event, callback);
                } else {
                    errorHandler.handle(
                        new Error('Socket not initialized'),
                        'Cannot subscribe to socket event'
                    );
                    return () => {};
                }
            }
        }
    };

    /**
     * =============================================================================
     * ERROR HANDLING SYSTEM
     * =============================================================================
     */
    const errorHandler = {
        /**
         * Error severity levels
         */
        SEVERITY: {
            INFO: 'info',
            WARNING: 'warning',
            ERROR: 'error',
            FATAL: 'fatal'
        },

        /**
         * Handles an application error
         * @param {Error} error - Error object
         * @param {string} context - Error context description
         * @param {string} severity - Error severity level
         */
        handle: (error, context, severity = errorHandler.SEVERITY.ERROR) => {
            // Create error record
            const errorRecord = {
                message: error.message,
                stack: error.stack,
                context,
                severity,
                timestamp: new Date().toISOString()
            };

            // Log to console with appropriate method
            switch (severity) {
                case errorHandler.SEVERITY.INFO:
                    console.info(`[${context}]`, error);
                    break;
                case errorHandler.SEVERITY.WARNING:
                    console.warn(`[${context}]`, error);
                    break;
                case errorHandler.SEVERITY.ERROR:
                    console.error(`[${context}]`, error);
                    break;
                case errorHandler.SEVERITY.FATAL:
                    console.error(`[FATAL] [${context}]`, error);
                    // For fatal errors, notify user
                    errorHandler.notifyUser(errorRecord);
                    break;
                default:
                    console.error(`[${context}]`, error);
            }

            // Store in error log for potential reporting
            errorHandler.log.push(errorRecord);

            // Trim log if it gets too long
            if (errorHandler.log.length > errorHandler.maxLogSize) {
                errorHandler.log = errorHandler.log.slice(-errorHandler.maxLogSize);
            }
        },

        /**
         * Error log for storing recent errors
         */
        log: [],

        /**
         * Maximum number of errors to keep in the log
         */
        maxLogSize: 100,

        /**
         * Notifies the user about a critical error
         * @param {Object} errorRecord - Error record
         */
        notifyUser: (errorRecord) => {
            // Implementation depends on UI framework
            // This is a simple implementation using alert
            alert(`Application Error: ${errorRecord.message}\n\nPlease refresh the page and try again.`);
        },

        /**
         * Creates a wrapped version of a function with error handling
         * @param {Function} fn - Function to wrap
         * @param {string} context - Error context description
         * @returns {Function} - Wrapped function
         */
        wrap: (fn, context) => {
            return (...args) => {
                try {
                    return fn(...args);
                } catch (error) {
                    errorHandler.handle(error, context);
                    throw error; // Re-throw for caller to handle if needed
                }
            };
        }
    };

    /**
     * =============================================================================
     * EVENT MANAGEMENT SYSTEM
     * =============================================================================
     */
    const eventManager = {
        /**
         * Event registry
         */
        listeners: {},

        /**
         * Dispatches an event
         * @param {string} eventName - Event name
         * @param {*} data - Event data
         */
        dispatch: (eventName, data) => {
            const listeners = eventManager.listeners[eventName] || [];
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    errorHandler.handle(
                        error,
                        `Error in event handler for ${eventName}`
                    );
                }
            });
        },

        /**
         * Subscribes to an event
         * @param {string} eventName - Event name
         * @param {Function} listener - Event listener
         * @returns {Function} - Unsubscribe function
         */
        subscribe: (eventName, listener) => {
            if (!eventManager.listeners[eventName]) {
                eventManager.listeners[eventName] = [];
            }

            eventManager.listeners[eventName].push(listener);

            // Return unsubscribe function
            return () => {
                eventManager.listeners[eventName] =
                    eventManager.listeners[eventName].filter(l => l !== listener);
            };
        },

        /**
         * Subscribes to multiple events
         * @param {Object} subscriptions - Map of event names to listeners
         * @returns {Function} - Unsubscribe function for all subscriptions
         */
        subscribeToMany: (subscriptions) => {
            const unsubscribeFunctions = Object.entries(subscriptions)
                .map(([eventName, listener]) =>
                    eventManager.subscribe(eventName, listener)
                );

            // Return function to unsubscribe from all
            return () => unsubscribeFunctions.forEach(fn => fn());
        }
    };

    /**
     * =============================================================================
     * UTILITY FUNCTIONS
     * =============================================================================
     */
    const utils = {
        /**
         * Formats a timestamp for display
         * @param {number|string} timestamp - Unix timestamp
         * @returns {string} - Formatted date string
         */
        formatDateAdded: (timestamp) => {
            const now = Date.now();
            const diff = now - Number(timestamp);
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            if (hours < 24) {
                return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ago`;
            } else if (days < 3) {
                return `${days} ${days === 1 ? 'Day' : 'Days'} ago`;
            } else {
                const date = new Date(Number(timestamp));
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear().toString().slice(-2);
                return `${day}/${month}/${year}`;
            }
        },

        /**
         * Shuffles an array using Fisher-Yates algorithm
         * @param {Array} array - Array to shuffle
         * @returns {Array} - Shuffled array
         */
        shuffleArray: (array) => {
            const result = [...array];
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        },

        /**
         * Groups images by their assigned tags
         * @param {Array} imageList - Array of image objects
         * @returns {Array} - Grouped image array
         */
        groupOrderImages: (imageList) => {
            const tagSet = new Set();

            // Collect all unique tag names
            imageList.forEach(img => {
                img.tags.forEach(t => {
                    const name = t.name.trim();
                    if (name) tagSet.add(name.toLowerCase());
                });
            });

            // Sort tag names
            const sortedTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
            if (sortedTags.length === 0) {
                return [];
            }

            // Group images by tag
            let grouped = [];
            sortedTags.forEach(tagName => {
                // Get images with this tag
                let groupImages = imageList.filter(img =>
                    img.tags.some(t => t.name.trim().toLowerCase() === tagName)
                );

                // Sort by title within group
                groupImages.sort((a, b) => a.title.localeCompare(b.title));
                grouped = grouped.concat(groupImages);
            });

            return grouped;
        },

        /**
         * Determines appropriate text color for a background color
         * @param {string} bgColor - Background color (hex)
         * @returns {string} - Appropriate text color for contrast
         */
        getContentColorForBackground: (bgColor) => {
            const index = CONFIG.COLORS.BACKGROUNDS.findIndex(
                col => col.toLowerCase() === bgColor.toLowerCase()
            );

            if (index !== -1) {
                return CONFIG.COLORS.CONTENT[index];
            }

            // Calculate contrast color for arbitrary background colors
            // Convert hex to RGB
            let hex = bgColor.replace('#', '');
            if (hex.length === 3) {
                hex = hex.split('').map(h => h + h).join('');
            }

            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // Calculate luminance
            // https://www.w3.org/TR/WCAG20-TECHS/G17.html#G17-tests
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            // Use white for dark backgrounds, black for light
            return luminance > 0.5 ? '#000000' : '#ffffff';
        },

        /**
         * Debounces a function call
         * @param {Function} func - Function to debounce
         * @param {number} wait - Wait time in milliseconds
         * @returns {Function} - Debounced function
         */
        debounce: (func, wait) => {
            let timeout;
            return function(...args) {
                const later = () => {
                    timeout = null;
                    func.apply(this, args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Creates a DOM element with attributes and children
         * @param {string} tag - HTML tag name
         * @param {Object} attrs - Element attributes
         * @param {Array} children - Child elements or text
         * @returns {HTMLElement} - Created element
         */
        createElement: (tag, attrs = {}, children = []) => {
            const element = document.createElement(tag);

            // Set attributes
            Object.entries(attrs).forEach(([key, value]) => {
                if (key === 'style' && typeof value === 'object') {
                    Object.entries(value).forEach(([prop, val]) => {
                        element.style[prop] = val;
                    });
                } else if (key === 'className') {
                    element.className = value;
                } else if (key === 'dataset') {
                    Object.entries(value).forEach(([dataKey, dataVal]) => {
                        element.dataset[dataKey] = dataVal;
                    });
                } else if (key.startsWith('on') && typeof value === 'function') {
                    const eventName = key.slice(2).toLowerCase();
                    element.addEventListener(eventName, value);
                } else {
                    element.setAttribute(key, value);
                }
            });

            // Add children
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof Node) {
                    element.appendChild(child);
                }
            });

            return element;
        }
    };

    // Export modules to global app namespace
    window.app = {
        config: CONFIG,
        state,
        subscribe,
        services,
        errorHandler,
        eventManager,
        utils,

        // Initialize application
        init: () => {
            console.log('Initializing application...');

            // Load modules based on current page
            const initModules =

                // Initialize core systems first
                services.socket.init();

            // Initialize page-specific modules
            if (document.getElementById(CONFIG.DOM.SLIDESHOW.CONTAINER)) {
                // SlideshowManager.init();
            } else if (document.getElementById(CONFIG.DOM.MANAGEMENT.SETTINGS_SECTION)) {
                // Initialize managers in dependency order
                services.images.getAll().then(() => {
                    // TagManager.init();
                    // PlaylistManager.init();

                    // Initialize Carbon tabs after modules are ready
                    initializeTabs();
                });
            }
        }
    };

    // Add tab initialization helper
    function initializeTabs() {
        const tabList = document.querySelector('.bx--tabs__nav');
        const tabs = tabList.querySelectorAll('.bx--tabs__nav-item');
        const panels = document.querySelectorAll('.bx--tab-panel');

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => {
                // Remove active state from all tabs and panels
                tabs.forEach(t => t.classList.remove('bx--tabs__nav-item--selected'));
                panels.forEach(p => p.setAttribute('aria-hidden', 'true'));

                // Set active state for clicked tab and its panel
                tab.classList.add('bx--tabs__nav-item--selected');
                panels[index].setAttribute('aria-hidden', 'false');
            });
        });
    }

    // Start the application when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        window.app.init();
    });
})(window, document);