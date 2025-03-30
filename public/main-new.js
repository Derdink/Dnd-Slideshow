'use strict';

// =====================
// Core Configuration
// =====================
const CONFIG = {
    APP: {
        NAME: 'D&D Slideshow',
        VERSION: '1.0.0',
        DEBUG: true
    },
    SLIDESHOW: {
        DEFAULT_TRANSITION: 3,
        ORDERS: ['random', 'alphabetical', 'groups'],
        EFFECTS: ['fade', 'slide']
    },
    PAGINATION: {
        DEFAULT_PAGE: 1,
        DEFAULT_LIMIT: 20,
        LIMITS: [20, 50, 100, 200]
    },
    API: {
        ENDPOINTS: {
            IMAGES: '/api/images',
            TAGS: '/api/tags',
            PLAYLISTS: '/api/playlists',
            SLIDESHOW: '/api/updateSlideshow'
        }
    },
    COLORS: {
        backgrounds: [
            "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
            "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
        ],
        content: [
            "#161616", "#121619", "#171414", "#a2191f", "#9f1853", "#6929c4",
            "#0043ce", "#00539a", "#005d5d", "#0e6027", "#d91313", "#f97d3f", "#265C34"
        ]
    },
    TABS: {
        MANAGE: ['images', 'playlists', 'settings'],
        FILTERS: ['tags', 'playlists']
    },
    MODALS: {
        EDIT_IMAGE: 'editModal',
        EDIT_TAG: 'tagEditModal',
        EDIT_PLAYLIST: 'playlistEditModal'
    },
    HTML: {
        SLIDESHOW: {
            CONTAINER: 'slideshow-container',
            SLIDES: ['slide1', 'slide2'],
            TITLES: ['title-overlay1', 'title-overlay2'],
            SUBTITLES: ['subtitle-overlay1', 'subtitle-overlay2'],
            CONTROLS: {
                PLAY: 'headerPlayBtn',
                PREV: 'headerPrevBtn',
                NEXT: 'headerNextBtn',
                RESET: 'headerResetBtn'
            }
        },
        MANAGE: {
            SECTIONS: {
                SETTINGS: 'settingsSection',
                TAGS: 'tagManagerSection',
                PLAYLISTS: 'playlistManagerSection'
            },
            TABLE: {
                CONTAINER: 'imageTable',
                BODY: 'imageTableBody',
                HEADER_SELECT: 'headerSelect'
            },
            UPLOAD: {
                AREA: 'dropArea',
                INPUT: 'fileInput'
            },
            SEARCH: 'search',
            FILTERS: {
                BUTTON: 'filterBtn',
                PANEL: 'filterPanel',
                TAG_DROPDOWN: 'tagFilterDropdown'
            }
        }
    },
    CSS: {
        COMMON: {
            ACTIVE: 'active',
            HIDDEN: 'hidden',
            SELECTED: 'selected',
            LOADING: 'loading',
            HIGHLIGHT: 'highlight'
        },
        SLIDESHOW: {
            HOVER_AREA: 'hover-area',
            TITLE_OVERLAY: 'title-overlay',
            SUBTITLE_OVERLAY: 'subtitle-overlay'
        },
        MANAGE: {
            ROW_SELECTED: 'selected',
            TAG_PILL: 'tag-pill',
            PLAYLIST_ITEM: 'playlist-item'
        }
    }
};

// =====================
// State Management System
// =====================
const createStore = (initialState = {}) => {
    let state = initialState;
    const listeners = new Set();

    return {
        getState: () => ({...state}),
        setState: (newState) => {
            state = {...state, ...newState};
            listeners.forEach(listener => listener(state));
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

const AppState = createStore({
    slideshow: {
        currentIndex: 0,
        isPaused: false,
        images: [],
        selectedImages: [],
        order: localStorage.getItem('slideshowOrder') || CONFIG.SLIDESHOW.ORDERS[0],
        transitionTime: parseFloat(localStorage.getItem('transitionTime')) || CONFIG.SLIDESHOW.DEFAULT_TRANSITION
    },
    management: {
        selectedIds: new Set(),
        filterTags: [],
        pagination: {
            page: CONFIG.PAGINATION.DEFAULT_PAGE,
            limit: CONFIG.PAGINATION.DEFAULT_LIMIT
        },
        sort: {
            key: null,
            direction: 'asc'
        }
    }
});

// =====================
// Service Layer
// =====================
const ApiService = {
    async fetch(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (!response.ok) {
                throw new ApiError(`API Error: ${response.statusText}`, response.status);
            }
            
            return await response.json();
        } catch (error) {
            ErrorHandler.handle(error);
            throw error;
        }
    },

    images: {
        getAll: () => ApiService.fetch(CONFIG.API.ENDPOINTS.IMAGES),
        update: (id, data) => ApiService.fetch(`${CONFIG.API.ENDPOINTS.IMAGES}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        delete: (id) => ApiService.fetch(`${CONFIG.API.ENDPOINTS.IMAGES}/${id}`, {
            method: 'DELETE'
        })
    },

    tags: {
        getAll: () => ApiService.fetch(CONFIG.API.ENDPOINTS.TAGS),
        create: (tag) => ApiService.fetch(CONFIG.API.ENDPOINTS.TAGS, {
            method: 'POST',
            body: JSON.stringify(tag)
        })
    }
};

// =====================
// Error Handling System
// =====================
class AppError extends Error {
    constructor(message, type = 'general', details = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.details = details;
        this.timestamp = new Date();
    }
}

class ApiError extends AppError {
    constructor(message, status, details = {}) {
        super(message, 'api', { status, ...details });
        this.name = 'ApiError';
    }
}

const ErrorHandler = {
    handle(error, context = '') {
        if (CONFIG.APP.DEBUG) {
            console.error(`[${error.name}] ${context}:`, error);
        }

        if (error instanceof ApiError) {
            this.handleApiError(error);
        } else {
            this.handleGeneralError(error);
        }

        // Emit error event for global handling
        EventBus.emit('error', { error, context });
    },

    handleApiError(error) {
        // Handle specific API error cases
        switch (error.details.status) {
            case 401:
                // Handle unauthorized
                break;
            case 404:
                // Handle not found
                break;
            default:
                // Handle other API errors
                break;
        }
    },

    handleGeneralError(error) {
        // Handle general application errors
    }
};

// =====================
// Event Management System
// =====================
const EventBus = {
    listeners: new Map(),

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    },

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    },

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    ErrorHandler.handle(error, `Event: ${event}`);
                }
            });
        }
    }
};

// =====================
// Socket Management
// =====================
const SocketManager = {
    socket: null,

    init() {
        this.socket = io();
        this.setupListeners();
    },

    setupListeners() {
        this.socket.on('connect', () => {
            console.log('Socket connected:', this.socket.id);
            EventBus.emit('socket:connected');
        });

        this.socket.on('connect_error', (error) => {
            ErrorHandler.handle(new AppError('Socket connection error', 'socket', error));
        });
    },

    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        }
    }
};

// =====================
// Slideshow Manager Module
// =====================
const SlideshowManager = {
    state: {
        currentIndex: 0,
        activeSlide: null,
        nextSlide: null,
        transitionInProgress: false,
        imageQueue: [],
        preloadedImages: new Map(),
        usedRandomImages: new Set()
    },

    elements: {
        container: null,
        slides: [],
        titles: [],
        subtitles: [],
        gradient: null,
        navigation: {
            leftArea: null,
            rightArea: null
        }
    },

    init() {
        try {
            this.cacheElements();
            this.setupEventListeners();
            this.setupIntersectionObserver();
            
            // Subscribe to AppState changes
            AppState.subscribe(state => this.handleStateChange(state));

            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'SlideshowManager.init');
            return false;
        }
    },

    cacheElements() {
        this.elements.container = document.getElementById(CONFIG.HTML.SLIDESHOW.CONTAINER);
        if (!this.elements.container) {
            throw new AppError('Slideshow container not found', 'initialization');
        }

        this.elements.slides = CONFIG.HTML.SLIDESHOW.SLIDES.map(id => 
            document.getElementById(id)
        );
        this.elements.titles = CONFIG.HTML.SLIDESHOW.TITLES.map(id => 
            document.getElementById(id)
        );
        this.elements.subtitles = CONFIG.HTML.SLIDESHOW.SUBTITLES.map(id => 
            document.getElementById(id)
        );

        // Verify all required elements exist
        if (!this.elements.slides.every(Boolean) || 
            !this.elements.titles.every(Boolean) || 
            !this.elements.subtitles.every(Boolean)) {
            throw new AppError('Required slideshow elements not found', 'initialization');
        }

        this.elements.gradient = document.querySelector('.image-container::after');
        this.elements.navigation = {
            leftArea: document.querySelector(`.${CONFIG.CSS.SLIDESHOW.HOVER_AREA}.left`),
            rightArea: document.querySelector(`.${CONFIG.CSS.SLIDESHOW.HOVER_AREA}.right`)
        };
    },

    setupEventListeners() {
        // Navigation
        this.elements.navigation.leftArea?.addEventListener('click', () => this.previous());
        this.elements.navigation.rightArea?.addEventListener('click', () => this.next());

        // Keyboard navigation
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') this.previous();
            else if (e.key === 'ArrowRight') this.next();
            else if (e.key === ' ') this.togglePlayback();
        });

        // Transition handling
        this.elements.slides.forEach(slide => {
            slide.addEventListener('transitionend', () => {
                this.state.transitionInProgress = false;
            });
        });

        // Window resize handling for viewport adjustments
        window.addEventListener('resize', this.handleResize.bind(this));
    },

    async crossfadeTo(index, imageList = null) {
        if (this.state.transitionInProgress) return;
        
        try {
            this.state.transitionInProgress = true;
            const images = imageList || AppState.getState().slideshow.images;
            
            if (!images.length) {
                throw new AppError('No images available for transition', 'transition');
            }

            const safeIndex = ((index % images.length) + images.length) % images.length;
            const nextImage = images[safeIndex];

            // Ensure image is loaded before transition
            await this.preloadImage(nextImage.url);

            // Start transition
            const [currentSlide, nextSlide] = this.elements.slides;
            const [currentTitle, nextTitle] = this.elements.titles;
            const [currentSubtitle, nextSubtitle] = this.elements.subtitles;

            // Update content
            nextSlide.src = nextImage.url;
            nextTitle.textContent = nextImage.title || '';
            nextSubtitle.textContent = nextImage.description || '';

            // Trigger transition
            requestAnimationFrame(() => {
                nextSlide.classList.add('active');
                nextTitle.classList.add('active');
                nextSubtitle.classList.add('active');
                
                currentSlide.classList.remove('active');
                currentTitle.classList.remove('active');
                currentSubtitle.classList.remove('active');
            });

            // Update state
            this.state.currentIndex = safeIndex;
            this.state.activeSlide = nextSlide;

            // Notify state change
            AppState.setState({
                slideshow: {
                    ...AppState.getState().slideshow,
                    currentIndex: safeIndex,
                    currentImage: nextImage
                }
            });

            // Emit event for other clients
            SocketManager.emit('slideshow:transition', {
                index: safeIndex,
                imageId: nextImage.id
            });

        } catch (error) {
            ErrorHandler.handle(error, 'SlideshowManager.crossfadeTo');
            this.state.transitionInProgress = false;
        }
    },

    async preloadImage(url) {
        if (this.state.preloadedImages.has(url)) {
            return this.state.preloadedImages.get(url);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.state.preloadedImages.set(url, img);
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        });
    },

    setupIntersectionObserver() {
        const options = {
            root: this.elements.container,
            rootMargin: '50px',
            threshold: 0.1
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        this.preloadImage(img.dataset.src)
                            .then(() => {
                                img.src = img.dataset.src;
                                img.removeAttribute('data-src');
                            })
                            .catch(error => ErrorHandler.handle(error, 'Image preload'));
                    }
                }
            });
        }, options);

        // Observe all images with data-src attribute
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.observer.observe(img);
        });
    },

    handleStateChange(state) {
        const { slideshow } = state;
        
        // Update UI based on state changes
        if (slideshow.isPaused !== this.state.isPaused) {
            this.updatePlaybackUI(slideshow.isPaused);
        }

        if (slideshow.order !== this.state.order) {
            this.reorderImages(slideshow.order);
        }
    },

    handleResize() {
        // Update layout and transitions for new viewport size
        this.elements.slides.forEach(slide => {
            slide.style.height = `${window.innerHeight}px`;
        });
    },

    // Navigation methods
    next() {
        const { order } = AppState.getState().slideshow;
        let nextIndex;

        switch (order) {
            case 'random':
                nextIndex = this.getNextRandomIndex();
                break;
            case 'groups':
                nextIndex = this.getNextGroupIndex();
                break;
            default:
                nextIndex = (this.state.currentIndex + 1) % this.state.imageQueue.length;
        }

        this.crossfadeTo(nextIndex);
    },

    previous() {
        const prevIndex = (this.state.currentIndex - 1 + this.state.imageQueue.length) % this.state.imageQueue.length;
        this.crossfadeTo(prevIndex);
    },

    getNextRandomIndex() {
        if (this.state.usedRandomImages.size >= this.state.imageQueue.length) {
            this.state.usedRandomImages.clear();
        }

        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * this.state.imageQueue.length);
        } while (this.state.usedRandomImages.has(this.state.imageQueue[nextIndex].id));

        this.state.usedRandomImages.add(this.state.imageQueue[nextIndex].id);
        return nextIndex;
    },

    cleanup() {
        // Remove event listeners
        this.observer?.disconnect();
        
        // Clear intervals and timeouts
        if (this.transitionTimeout) {
            clearTimeout(this.transitionTimeout);
        }
        
        // Clear image cache
        this.state.preloadedImages.clear();
        
        // Reset state
        this.state = {
            currentIndex: 0,
            activeSlide: null,
            nextSlide: null,
            transitionInProgress: false,
            imageQueue: [],
            preloadedImages: new Map(),
            usedRandomImages: new Set()
        };
    },

    togglePlayback() {
        const { isPaused } = AppState.getState().slideshow;
        AppState.setState({
            slideshow: {
                ...AppState.getState().slideshow,
                isPaused: !isPaused
            }
        });

        if (isPaused) {
            this.startSlideshow();
        } else {
            this.stopSlideshow();
        }

        SocketManager.emit('slideAction', {
            action: !isPaused ? 'pause' : 'play'
        });
    },

    startSlideshow() {
        if (this.state.transitionInProgress) return;
        const { transitionTime } = AppState.getState().slideshow;
        if (this.transitionTimeout) clearTimeout(this.transitionTimeout);
        this.transitionTimeout = setInterval(() => this.next(), transitionTime * 1000);
    },

    stopSlideshow() {
        if (this.transitionTimeout) {
            clearTimeout(this.transitionTimeout);
            this.transitionTimeout = null;
        }
    },

    updatePlaybackUI(isPaused) {
        const playBtn = document.getElementById('headerPlayBtn');
        if (!playBtn) return;

        playBtn.innerHTML = isPaused ? 
            `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32">
                <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28Z"></path>
                <title>Play</title>
            </svg>` :
            `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="32" height="32" viewBox="0 0 32 32">
                <path d="M12 8V24H8V8h4m0-2H8A2 2 0 006 8V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2zM24 8V24H20V8h4m0-2H20a2 2 0 00-2 2V24a2 2 0 002 2h4a2 2 0 002-2V8a2 2 0 00-2-2z"></path>
                <title>Pause</title>
            </svg>`;
    }
};

// =====================
// Image Manager Module
// =====================
const ImageManager = {
    state: {
        images: [],
        selectedIds: new Set(),
        filters: {
            search: '',
            tags: new Set(),
            playlists: new Set()
        },
        pagination: {
            page: 1,
            limit: 20,
            total: 0
        },
        sort: {
            key: null,
            direction: 'asc'
        },
        loading: false,
        observer: null
    },

    elements: {
        table: null,
        tbody: null,
        uploadArea: null,
        searchInput: null,
        filterBtn: null,
        filterPanel: null,
        bulkControls: null,
        editModal: null,
        editForm: null,
        editTitle: null,
        editDescription: null,
        headerSelect: null,
        loadingIndicator: null
    },

    async init() {
        try {
            this.cacheElements();
            this.setupEventListeners();
            this.setupIntersectionObserver();
            await this.loadImages();
            
            // Subscribe to AppState changes
            AppState.subscribe(state => this.handleStateChange(state));
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'ImageManager.init');
            return false;
        }
    },

    cacheElements() {
        this.elements = {
            table: document.getElementById(CONFIG.HTML.MANAGE.TABLE.CONTAINER),
            tbody: document.querySelector(`#${CONFIG.HTML.MANAGE.TABLE.CONTAINER} tbody`),
            uploadArea: document.getElementById(CONFIG.HTML.MANAGE.UPLOAD.AREA),
            searchInput: document.getElementById(CONFIG.HTML.MANAGE.SEARCH),
            filterBtn: document.getElementById(CONFIG.HTML.MANAGE.FILTERS.BUTTON),
            filterPanel: document.getElementById(CONFIG.HTML.MANAGE.FILTERS.PANEL),
            bulkControls: document.getElementById('bulkControls'),
            editModal: document.getElementById(CONFIG.MODALS.EDIT_IMAGE),
            editForm: document.getElementById('editForm'),
            editTitle: document.getElementById('editTitle'),
            editDescription: document.getElementById('editDescription'),
            headerSelect: document.getElementById(CONFIG.HTML.MANAGE.TABLE.HEADER_SELECT),
            loadingIndicator: document.querySelector('.loading-indicator')
        };

        if (!this.elements.table || !this.elements.tbody) {
            throw new AppError('Required image table elements not found', 'initialization');
        }
    },

    setupEventListeners() {
        // Upload handling
        if (this.elements.uploadArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
                this.elements.uploadArea.addEventListener(event, this.handleDragEvent.bind(this));
            });
        }

        // Search input with debounce
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', 
                Utils.debounce(e => this.handleSearch(e.target.value), 250)
            );
        }

        // Filter panel toggle
        if (this.elements.filterBtn) {
            this.elements.filterBtn.addEventListener('click', this.toggleFilterPanel.bind(this));
        }

        // Bulk selection handling
        const headerCheckbox = document.querySelector('#imageTable th input[type="checkbox"]');
        if (headerCheckbox) {
            headerCheckbox.addEventListener('change', this.handleBulkSelection.bind(this));
        }
    },

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            this.loadImage(img);
                        }
                    }
                });
            },
            {
                root: null,
                rootMargin: '50px',
                threshold: 0.1
            }
        );
    },

    async loadImages() {
        try {
            this.state.loading = true;
            this.updateLoadingState();

            const response = await ApiService.images.getAll();
            this.state.images = response;
            this.state.pagination.total = response.length;

            await this.renderTable();
            this.updatePagination();

        } catch (error) {
            ErrorHandler.handle(error, 'ImageManager.loadImages');
        } finally {
            this.state.loading = false;
            this.updateLoadingState();
        }
    },

    async handleUpload(files) {
        try {
            const formData = new FormData();
            const validFiles = Array.from(files).filter(this.validateFile);

            if (validFiles.length === 0) {
                throw new AppError('No valid files to upload', 'upload');
            }

            validFiles.forEach(file => formData.append('files', file));

            const response = await ApiService.fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.needsTitleEdit) {
                await this.handleTitleEdits(response.images);
            }

            await this.loadImages();
            EventBus.emit('images:uploaded', response.images);

        } catch (error) {
            ErrorHandler.handle(error, 'ImageManager.handleUpload');
        }
    },

    validateFile(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validTypes.includes(file.type)) {
            EventBus.emit('error', {
                error: new AppError('Invalid file type', 'validation'),
                context: file.name
            });
            return false;
        }

        if (file.size > maxSize) {
            EventBus.emit('error', {
                error: new AppError('File too large', 'validation'),
                context: file.name
            });
            return false;
        }

        return true;
    },

    async renderTable() {
        const start = (this.state.pagination.page - 1) * this.state.pagination.limit;
        const end = start + this.state.pagination.limit;
        
        const filteredImages = this.getFilteredImages();
        const pageImages = filteredImages.slice(start, end);

        this.elements.tbody.innerHTML = '';
        
        pageImages.forEach(image => {
            const row = this.createTableRow(image);
            this.elements.tbody.appendChild(row);
        });

        this.updateBulkSelectionState();
    },

    getFilteredImages() {
        return this.state.images.filter(image => {
            // Always show selected images
            if (this.state.selectedIds.has(image.id)) return true;

            // Apply search filter
            if (this.state.filters.search && 
                !image.title.toLowerCase().includes(this.state.filters.search.toLowerCase())) {
                return false;
            }

            // Apply tag filters
            if (this.state.filters.tags.size > 0) {
                const imageTags = new Set(image.tags.map(t => t.name.toLowerCase()));
                if (!Array.from(this.state.filters.tags).every(tag => imageTags.has(tag))) {
                    return false;
                }
            }

            // Apply playlist filters
            if (this.state.filters.playlists.size > 0) {
                return Array.from(this.state.filters.playlists).some(playlistId => {
                    const playlist = playlists.find(p => p.id === playlistId);
                    return playlist && playlist.imageIds.includes(image.id);
                });
            }

            return true;
        });
    },

    createTableRow(image) {
        const row = document.createElement('tr');
        row.dataset.id = image.id;
        row.className = this.state.selectedIds.has(image.id) ? 
            CONFIG.CSS.MANAGE.ROW_SELECTED : '';

        row.innerHTML = `
            <td class="col-select">
                <label class="custom-checkbox">
                    <input type="checkbox" class="selectImage" value="${image.id}" 
                           ${this.state.selectedIds.has(image.id) ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
            <td class="col-thumb">
                <div class="thumbnail-skeleton"></div>
                <img class="thumbnail" data-src="${image.thumbnailUrl}" alt="${image.title}">
            </td>
            <td class="col-name">${image.title}</td>
            <td class="col-tags">${this.renderTags(image.tags)}</td>
            <td class="col-date">${Utils.formatDateAdded(image.dateAdded)}</td>
            <td class="col-actions">${this.renderActions()}</td>
        `;

        // Handle row selection
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.col-actions')) {
                this.toggleRowSelection(row);
            }
        });

        // Observe thumbnail for lazy loading
        const thumbnail = row.querySelector('.thumbnail');
        if (thumbnail) {
            this.observer.observe(thumbnail);
        }

        return row;
    },

    toggleRowSelection(row) {
        const id = parseInt(row.dataset.id);
        const checked = !this.state.selectedIds.has(id);

        if (checked) {
            this.state.selectedIds.add(id);
        } else {
            this.state.selectedIds.delete(id);
        }

        row.classList.toggle('selected', checked);
        row.querySelector('.selectImage').checked = checked;
        
        this.updateBulkSelectionState();
        this.renderTable(); // Re-render to ensure selected items stay visible
    },

    updateBulkSelectionState() {
        const headerCheckbox = document.querySelector('#imageTable th input[type="checkbox"]');
        if (!headerCheckbox) return;

        const visibleCheckboxes = Array.from(document.querySelectorAll('.selectImage'));
        const allChecked = visibleCheckboxes.length > 0 && 
            visibleCheckboxes.every(cb => cb.checked);
        const someChecked = visibleCheckboxes.some(cb => cb.checked);

        headerCheckbox.checked = allChecked;
        headerCheckbox.indeterminate = !allChecked && someChecked;
    },

    handleBulkSelection(e) {
        const checked = e.target.checked;
        document.querySelectorAll('.selectImage').forEach(checkbox => {
            const id = parseInt(checkbox.value);
            if (checked) {
                this.state.selectedIds.add(id);
            } else {
                this.state.selectedIds.delete(id);
            }
            checkbox.checked = checked;
            const row = checkbox.closest('tr');
            if (row) {
                row.classList.toggle('selected', checked);
            }
        });
        this.renderTable();
    },

    cleanup() {
        this.observer?.disconnect();
        this.state.selectedIds.clear();
        this.state.filters.tags.clear();
        this.state.filters.playlists.clear();
    },

    getSelectedImageIds() {
        return Array.from(this.state.selectedIds);
    },

    handleDragEvent(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.type === 'drop') {
            this.handleUpload(e.dataTransfer.files);
        } else {
            this.elements.uploadArea.classList.toggle('highlight', 
                e.type === 'dragenter' || e.type === 'dragover');
        }
    },

    updateLoadingState() {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = 
                this.state.loading ? 'block' : 'none';
        }
        if (this.elements.table) {
            this.elements.table.classList.toggle('loading', this.state.loading);
        }
    },

    renderTags(tags) {
        return tags
            .filter(tag => tag.name.toLowerCase() !== 'all')
            .map(tag => `<span class="tag-pill" style="--pill-color: ${tag.color}">${tag.name}</span>`)
            .join('');
    },

    renderActions() {
        return `
            <button class="deleteBtn" title="Delete image">
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                    <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
                    <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
                </svg>
            </button>
            <button class="playBtn" title="Play this image">
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                    <path d="M7 28a1 1 0 01-1-1V5a1 1 0 011.4819-.8763l20 11a1 1 0 010 1.7525l-20 11A1.0005,1.0005,0 017 28Z"></path>
                </svg>
            </button>
            <button class="editBtn" title="Edit image">
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
                    <path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8 0 0 0 0 0 0l-3.6-3.6c-.8-.8-2-.8-2.8 0 0 0 0 0 0 0l-15 15V24h6.4L25.4 9zM20.4 4L24 7.6l-3 3L17.4 7 20.4 4zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path>
                </svg>
            </button>
        `;
    }
};

// =====================
// Tag Manager Module
// =====================
const TagManager = {
    state: {
        tags: [],
        selectedTags: new Set(),
        colorIndex: parseInt(localStorage.getItem('nextTagColorIndex')) || 0,
        colors: CONFIG.COLORS.backgrounds,
        editingTagId: null
    },

    constants: {
        HIDDEN_TAG: {
            name: 'Hidden',
            color: '#161616',
            id: 'hidden',
            system: true
        }
    },

    init() {
        try {
            this.setupEventListeners();
            this.loadTags();
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.init');
            return false;
        }
    },

    setupEventListeners() {
        // New tag form
        const form = document.getElementById('newTagForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createTag(
                    document.getElementById('newTagName').value.trim()
                );
            });
        }

        // Tag manager toggle
        const toggle = document.getElementById('tagManagerToggle');
        if (toggle) {
            toggle.addEventListener('click', () => this.toggleTagManager());
        }
    },

    async loadTags() {
        try {
            const response = await ApiService.tags.getAll();
            this.state.tags = response.filter(tag => 
                tag && tag.name && tag.name.toLowerCase() !== 'all'
            ).sort((a, b) => a.name.localeCompare(b.name));
            
            this.renderTags();
            this.updateTagFilters();
            return this.state.tags;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.loadTags');
            return [];
        }
    },

    async createTag(name, selectedImageIds = []) {
        try {
            // Validation
            if (!this.validateTagName(name)) {
                throw new AppError('Invalid tag name', 'validation');
            }

            // Get next color
            const color = this.getNextColor();

            // Create tag
            const response = await ApiService.fetch('/api/tags', {
                method: 'POST',
                body: JSON.stringify({ name, color })
            });

            const newTag = response.tag;

            // Apply to selected images if any
            if (selectedImageIds.length > 0) {
                await this.applyTagToImages(newTag.id, selectedImageIds);
            }

            // Update local state
            this.state.tags.push(newTag);
            this.state.tags.sort((a, b) => a.name.localeCompare(b.name));

            // Update UI
            this.renderTags();
            this.updateTagFilters();
            document.getElementById('newTagForm')?.reset();

            return newTag;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.createTag');
            throw error;
        }
    },

    async deleteTag(tagId) {
        try {
            if (tagId === this.constants.HIDDEN_TAG.id) {
                throw new AppError('Cannot delete system tag', 'validation');
            }

            // Confirm deletion
            if (!confirm('Delete this tag? It will be removed from all images.')) {
                return false;
            }

            await ApiService.fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
            
            // Update local state
            this.state.tags = this.state.tags.filter(t => t.id !== tagId);
            
            // Update UI
            this.renderTags();
            this.updateTagFilters();
            
            // Refresh images to update tags
            ImageManager.loadImages();
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.deleteTag');
            return false;
        }
    },

    async updateTag(tagId, updates) {
        try {
            if (tagId === this.constants.HIDDEN_TAG.id) {
                throw new AppError('Cannot modify system tag', 'validation');
            }

            const response = await ApiService.fetch(`/api/tags/${tagId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            // Update local state
            const index = this.state.tags.findIndex(t => t.id === tagId);
            if (index !== -1) {
                this.state.tags[index] = { ...this.state.tags[index], ...updates };
            }

            // Update UI
            this.renderTags();
            this.updateTagFilters();
            
            return response.tag;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.updateTag');
            throw error;
        }
    },

    async applyTagToImages(tagId, imageIds) {
        try {
            await ApiService.fetch('/api/entries/tags', {
                method: 'POST',
                body: JSON.stringify({ 
                    tag: this.state.tags.find(t => t.id === tagId)?.name,
                    ids: imageIds 
                })
            });

            // Refresh images to update tags
            ImageManager.loadImages();
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.applyTagToImages');
            return false;
        }
    },

    async removeTagFromImages(tagId, imageIds) {
        try {
            await ApiService.fetch('/api/entries/tags', {
                method: 'DELETE',
                body: JSON.stringify({
                    tag: this.state.tags.find(t => t.id === tagId)?.name,
                    ids: imageIds
                })
            });

            // Refresh images to update tags
            ImageManager.loadImages();
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'TagManager.removeTagFromImages');
            return false;
        }
    },

    renderTags() {
        const container = document.getElementById('tagManagerSection');
        if (!container) return;

        container.innerHTML = '';
        
        // Add system tags first
        this.renderTagPill(container, this.constants.HIDDEN_TAG);

        // Add user tags
        this.state.tags.forEach(tag => this.renderTagPill(container, tag));
    },

    renderTagPill(container, tag) {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.dataset.id = tag.id;
        
        const color = tag.color || this.getNextColor();
        pill.style.setProperty('--pill-color', color);
        
        const contrast = this.getContentColor(color);
        
        pill.innerHTML = `
            <div class="tagIcon">
                ${!tag.system ? `
                    <button type="button" class="tagDeleteButton" title="Delete tag">
                        <svg focusable="false" preserveAspectRatio="xMidYMid meet" 
                             fill="${contrast}" width="16" height="16" viewBox="0 0 32 32">
                            <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
                            <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <span class="tagContents">
                <span class="tagName">${tag.name}</span>
                <span class="tagClear">
                    <button type="button" class="tagRemoveButton" title="Remove tag from selected images">
                        <svg focusable="false" preserveAspectRatio="xMidYMid meet" 
                             fill="${contrast}" width="16" height="16" viewBox="0 0 32 32">
                            <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
                        </svg>
                    </button>
                </span>
            </span>
        `;

        // Attach event handlers
        if (!tag.system) {
            // Delete tag
            pill.querySelector('.tagDeleteButton')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTag(tag.id);
            });

            // Edit tag name on double click
            pill.querySelector('.tagName').addEventListener('dblclick', () => {
                this.showTagEditModal(tag);
            });
        }

        // Apply tag to selected images
        pill.addEventListener('click', (e) => {
            if (e.target.closest('.tagRemoveButton')) return;
            
            const selectedIds = ImageManager.getSelectedImageIds();
            if (selectedIds.length > 0) {
                this.applyTagToImages(tag.id, selectedIds);
            }
        });

        // Remove tag from selected images
        pill.querySelector('.tagRemoveButton').addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedIds = ImageManager.getSelectedImageIds();
            if (selectedIds.length > 0) {
                this.removeTagFromImages(tag.id, selectedIds);
            }
        });

        container.appendChild(pill);
    },

    validateTagName(name) {
        return name && 
               name.length >= 2 && 
               name.length <= 50 && 
               !/[<>{}()''"/\\]/.test(name);
    },

    getNextColor() {
        const color = this.state.colors[this.state.colorIndex];
        this.state.colorIndex = (this.state.colorIndex + 1) % this.state.colors.length;
        localStorage.setItem('nextTagColorIndex', this.state.colorIndex);
        return color;
    },

    getContentColor(bgColor) {
        const index = this.state.colors.findIndex(c => 
            c.toLowerCase() === bgColor.toLowerCase()
        );
        return index !== -1 ? CONFIG.COLORS.content[index] : "#ffffff";
    },

    toggleTagManager() {
        const section = document.getElementById('tagManagerSection');
        const form = document.getElementById('newTagForm');
        const toggle = document.getElementById('tagManagerToggle');
        const playlistSection = document.getElementById('playlistManagerSection');
        const playlistToggle = document.getElementById('playlistManagerToggle');

        if (!section || !form || !toggle) return;

        const isVisible = window.getComputedStyle(section).display !== 'none';

        // Close playlist manager if open
        if (playlistSection && playlistToggle) {
            playlistSection.style.display = 'none';
            playlistToggle.classList.remove('active');
        }

        section.style.display = isVisible ? 'none' : 'flex';
        form.style.display = isVisible ? 'none' : 'flex';
        toggle.classList.toggle('active');

        if (!isVisible) {
            this.loadTags();
        }
    },

    updateTagFilters() {
        // Update tag filters in the image management interface
        const dropdown = document.getElementById('tagFilterDropdown');
        if (!dropdown) return;

        dropdown.innerHTML = '';
        this.state.tags.forEach(tag => {
            // Create and append filter pills
            // ... existing filter pill creation code ...
        });
    },

    showTagEditModal(tag) {
        const modal = document.getElementById(CONFIG.MODALS.EDIT_TAG);
        if (!modal) return;

        const nameInput = modal.querySelector('#editTagName');
        const saveBtn = modal.querySelector('#saveTagEditBtn');
        const closeBtn = modal.querySelector('#closeTagEditBtn');

        if (nameInput) nameInput.value = tag.name;
        modal.setAttribute('data-tag-id', tag.id);
        modal.style.display = 'block';

        const handleSave = async () => {
            const newName = nameInput.value.trim();
            if (this.validateTagName(newName)) {
                await this.updateTag(tag.id, { name: newName });
                modal.style.display = 'none';
            }
        };

        saveBtn?.addEventListener('click', handleSave);
        closeBtn?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
};

// Initialize TagManager when document is ready
if (document.getElementById('tagManagerSection')) {
    document.addEventListener('DOMContentLoaded', () => {
        TagManager.init();
    });
}

// =====================
// Playlist Manager Module
// =====================
const PlaylistManager = {
    state: {
        playlists: [],
        selectedIds: new Set(),
        colorIndex: parseInt(localStorage.getItem('nextPlaylistColorIndex')) || 0,
        expandedPlaylists: new Set(),
        editingPlaylistId: null,
        searchTerm: ''
    },

    init() {
        try {
            this.setupEventListeners();
            this.loadPlaylists();
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.init');
            return false;
        }
    },

    setupEventListeners() {
        // Playlist manager toggle
        const toggle = document.getElementById('playlistManagerToggle');
        if (toggle) {
            toggle.addEventListener('click', () => this.toggleManager());
        }

        // New playlist form
        const form = document.getElementById('newPlaylistForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('newPlaylistName').value.trim();
                const selectedImages = ImageManager.getSelectedImageIds();
                await this.createPlaylist(name, selectedImages);
            });
        }

        // Search input
        const searchInput = document.getElementById('playlistSearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.state.searchTerm = e.target.value.trim().toLowerCase();
                this.renderPlaylists();
            }, 250));
        }
    },

    async loadPlaylists() {
        try {
            const response = await ApiService.fetch('/api/playlists');
            this.state.playlists = response;
            this.renderPlaylists();
            return this.state.playlists;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.loadPlaylists');
            return [];
        }
    },

    async createPlaylist(name, imageIds = []) {
        try {
            if (!this.validatePlaylistName(name)) {
                throw new AppError('Invalid playlist name', 'validation');
            }

            const playlist = {
                id: Date.now(),
                name,
                color: CONFIG.COLORS.backgrounds[this.state.colorIndex],
                imageIds: [...imageIds],
                hidden: false
            };

            // Update color index
            this.state.colorIndex = (this.state.colorIndex + 1) % CONFIG.COLORS.backgrounds.length;
            localStorage.setItem('nextPlaylistColorIndex', this.state.colorIndex);

            const response = await ApiService.fetch('/api/playlists', {
                method: 'POST',
                body: JSON.stringify(playlist)
            });

            this.state.playlists.push(response.playlist);
            this.renderPlaylists();
            document.getElementById('newPlaylistForm')?.reset();

            return response.playlist;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.createPlaylist');
            throw error;
        }
    },

    async deletePlaylist(id) {
        try {
            if (!confirm('Delete this playlist?')) return false;

            await ApiService.fetch(`/api/playlists/${id}`, { method: 'DELETE' });
            this.state.playlists = this.state.playlists.filter(p => p.id !== id);
            this.renderPlaylists();
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.deletePlaylist');
            return false;
        }
    },

    async updatePlaylist(id, updates) {
        try {
            const response = await ApiService.fetch(`/api/playlists/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            const index = this.state.playlists.findIndex(p => p.id === id);
            if (index !== -1) {
                this.state.playlists[index] = { ...this.state.playlists[index], ...updates };
            }

            this.renderPlaylists();
            return response.playlist;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.updatePlaylist');
            throw error;
        }
    },

    async addImagesToPlaylist(playlistId, imageIds) {
        try {
            const playlist = this.state.playlists.find(p => p.id === playlistId);
            if (!playlist) throw new AppError('Playlist not found', 'validation');

            const newImageIds = [...new Set([...playlist.imageIds, ...imageIds])];
            await this.updatePlaylist(playlistId, { imageIds: newImageIds });
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.addImagesToPlaylist');
            return false;
        }
    },

    async removeImagesFromPlaylist(playlistId, imageIds) {
        try {
            const playlist = this.state.playlists.find(p => p.id === playlistId);
            if (!playlist) throw new AppError('Playlist not found', 'validation');

            const newImageIds = playlist.imageIds.filter(id => !imageIds.includes(id));
            await this.updatePlaylist(playlistId, { imageIds: newImageIds });
            
            return true;
        } catch (error) {
            ErrorHandler.handle(error, 'PlaylistManager.removeImagesFromPlaylist');
            return false;
        }
    },

    toggleVisibility(playlistId) {
        const playlist = this.state.playlists.find(p => p.id === playlistId);
        if (playlist) {
            this.updatePlaylist(playlistId, { hidden: !playlist.hidden });
        }
    },

    toggleExpanded(playlistId) {
        if (this.state.expandedPlaylists.has(playlistId)) {
            this.state.expandedPlaylists.delete(playlistId);
        } else {
            this.state.expandedPlaylists.add(playlistId);
        }
        this.renderPlaylists();
    },

    showEditModal(playlist) {
        const modal = document.getElementById(CONFIG.MODALS.EDIT_PLAYLIST);
        if (!modal) return;

        const nameInput = modal.querySelector('#editPlaylistName');
        const saveBtn = modal.querySelector('#savePlaylistEditBtn');
        const closeBtn = modal.querySelector('#closePlaylistEditBtn');

        if (nameInput) {
            nameInput.value = playlist.name;
        }

        modal.setAttribute('data-playlist-id', playlist.id);
        modal.style.display = 'block';

        const handleSave = async () => {
            const newName = nameInput.value.trim();
            if (this.validatePlaylistName(newName)) {
                await this.updatePlaylist(playlist.id, { name: newName });
                modal.style.display = 'none';
            }
        };

        saveBtn?.addEventListener('click', handleSave);
        closeBtn?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    },

    validatePlaylistName(name) {
        return name && 
               name.length >= 2 && 
               name.length <= 50 && 
               !/[<>{}()''"/\\]/.test(name);
    },

    renderPlaylists() {
        const container = document.getElementById('playlistList');
        if (!container) return;

        let playlists = [...this.state.playlists];
        
        // Apply search filter
        if (this.state.searchTerm) {
            playlists = playlists.filter(p => 
                p.name.toLowerCase().includes(this.state.searchTerm)
            );
        }

        container.innerHTML = playlists.length ? '' : '<div class="bx--tile">No playlists found.</div>';

        playlists.forEach(playlist => {
            const item = document.createElement('div');
            item.className = `playlist-item${playlist.hidden ? ' hidden' : ''}`;
            item.dataset.id = playlist.id;

            const isExpanded = this.state.expandedPlaylists.has(playlist.id);
            
            item.innerHTML = `
                <div class="playlist-header">
                    <span class="playlist-color" style="background-color: ${playlist.color}"></span>
                    <h4 class="playlist-name">${playlist.name}</h4>
                    <span class="playlist-count${isExpanded ? ' expanded' : ''}">(${playlist.imageIds.length} images)</span>
                    <div class="playlist-actions">
                        <button class="editBtn" title="Edit playlist">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M1 11.4L11.4 1l2.6 2.6-10.4 10.4H1v-2.6zm1-1.7l8.7-8.7 1.3 1.3-8.7 8.7H2v-1.3z"/>
                            </svg>
                        </button>
                        <button class="visibilityBtn" title="${playlist.hidden ? 'Show playlist' : 'Hide playlist'}">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="${playlist.hidden ? 
                                    'M13.359 11.238l-.707.707-2.829-2.829L8 11.238l-2.828-2.829-2.829 2.829-.707-.707L4.172 8 1.343 5.172l.707-.707L4.879 7.293 7.707 4.465l2.829 2.828 2.828-2.828.707.707L11.243 8z' :
                                    'M15.5 8c0-.4-.1-.8-.3-1.1-.3-.7-.7-1.3-1.2-1.8-1.2-1.3-2.8-2.3-4.5-2.6-.5-.1-1-.2-1.5-.2s-1 .1-1.5.2c-1.7.3-3.3 1.3-4.5 2.6-.5.5-.9 1.1-1.2 1.8-.2.3-.3.7-.3 1.1 0 .4.1.8.3 1.1.3.7.7 1.3 1.2 1.8 1.2 1.3 2.8 2.3 4.5 2.6.5.1 1 .2 1.5.2s1-.1 1.5-.2c1.7-.3 3.3-1.3 4.5-2.6.5-.5.9-1.1 1.2-1.8.2-.3.3-.7.3-1.1zm-2.7 0c0 .8-.3 1.5-.8 2.1-.7.9-1.7 1.5-2.9 1.7-.4.1-.7.1-1.1.1s-.7 0-1.1-.1c-1.2-.2-2.2-.8-2.9-1.7-.5-.6-.8-1.3-.8-2.1s.3-1.5.8-2.1c.7-.9 1.7-1.5 2.9-1.7.4-.1.7-.1 1.1-.1s.7 0 1.1.1c1.2.2 2.2.8 2.9 1.7.5.6.8 1.3.8 2.1z'}"/>
                            </svg>
                        </button>
                        <button class="deleteBtn" title="Delete playlist">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M6 6v6h1V6H6zm3 0v6h1V6H9zM2 4v1h1v10c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V5h1V4H2zm2 11V5h8v10H4zM6 2h4v1H6V2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                ${isExpanded ? this.renderPlaylistImages(playlist) : ''}
            `;

            // Attach event handlers
            item.querySelector('.playlist-header').addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.toggleExpanded(playlist.id);
                }
            });

            item.querySelector('.editBtn').addEventListener('click', () => {
                this.showEditModal(playlist);
            });

            item.querySelector('.visibilityBtn').addEventListener('click', () => {
                this.toggleVisibility(playlist.id);
            });

            item.querySelector('.deleteBtn').addEventListener('click', () => {
                this.deletePlaylist(playlist.id);
            });

            container.appendChild(item);
        });
    },

    renderPlaylistImages(playlist) {
        return `
            <div class="playlist-images">
                ${playlist.imageIds.map(imageId => {
                    const image = window.images.find(img => img.id === imageId);
                    if (!image) return '';
                    return `
                        <div class="playlist-image">
                            <img src="${image.thumbnailUrl}" alt="${image.title}">
                            <button class="remove-image" title="Remove from playlist"
                                    onclick="PlaylistManager.removeImagesFromPlaylist(${playlist.id}, [${imageId}])">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path d="M8 6.586L5.879 4.464 4.464 5.88 6.586 8l-2.122 2.121 1.415 1.415L8 9.414l2.121 2.122 1.415-1.415L9.414 8l2.122-2.121-1.415-1.415L8 6.586z"/>
                                </svg>
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    toggleManager() {
        const section = document.getElementById('playlistManagerSection');
        const tagSection = document.getElementById('tagManagerSection');
        const tagToggle = document.getElementById('tagManagerToggle');
        const toggle = document.getElementById('playlistManagerToggle');

        if (!section || !toggle) return;

        const isVisible = window.getComputedStyle(section).display !== 'none';

        // Close tag manager if open
        if (tagSection && tagToggle) {
            tagSection.style.display = 'none';
            tagToggle.classList.remove('active');
        }

        section.style.display = isVisible ? 'none' : 'flex';
        toggle.classList.toggle('active');

        if (!isVisible) {
            this.loadPlaylists().then(() => {
                displayPlaylistFilters(); // Call this after playlists are loaded
            });
        }
    }
};

// Initialize PlaylistManager when document is ready
if (document.getElementById('playlistManagerSection')) {
    document.addEventListener('DOMContentLoaded', () => {
        PlaylistManager.init();
    });
}

// =====================
// Initialize Application
// =====================
function initializeApplication() {
    try {
        // Initialize core systems first
        SocketManager.init();
        
        // Initialize page-specific modules
        if (document.getElementById(CONFIG.HTML.SLIDESHOW.CONTAINER)) {
            SlideshowManager.init();
        } else if (document.getElementById(CONFIG.HTML.MANAGE.SECTIONS.SETTINGS)) {
            // Initialize managers in dependency order
            ImageManager.init().then(() => {
                TagManager.init();
                PlaylistManager.init();
                
                // Initialize Carbon tabs after modules are ready
                initializeTabs();
            });
        }

    } catch (error) {
        ErrorHandler.handle(error, 'Initialization');
    }
}

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
document.addEventListener('DOMContentLoaded', initializeApplication);

// Export modules for use in other files
export {
    CONFIG,
    AppState,
    ApiService,
    ErrorHandler,
    EventBus,
    SocketManager
};

const Utils = {
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    formatDateAdded(timestamp) {
        const now = Date.now();
        const diff = now - Number(timestamp);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (hours < 24) {
            return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ago`;
        } else if (days < 3) {
            return `${days} ${days === 1 ? 'Day' : 'Days'} ago`;
        }
        const date = new Date(Number(timestamp));
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
    }
};

// Add playlist filter initialization to filterTabsWrapper click handler
document.addEventListener('DOMContentLoaded', () => {
    const filterBtn = document.getElementById('filterBtn');
    const filterTabsWrapper = document.getElementById('filterTabsWrapper');

    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            const isVisible = filterTabsWrapper.style.display !== 'none';
            filterTabsWrapper.style.display = isVisible ? 'none' : 'block';
            filterBtn.classList.toggle('active');

            // Initialize playlist filters when tab becomes visible
            if (!isVisible) {
                displayPlaylistFilters();
            }
        });
    }

    // Initialize when playlist tab is selected
    const playlistTab = document.querySelector('[data-tab="playlists"]');
    if (playlistTab) {
        playlistTab.addEventListener('click', () => {
            displayPlaylistFilters();
        });
    }
});

// Update loadPlaylists to call displayPlaylistFilters
async function loadPlaylists() {
    // Only load playlists on manage page
    if (!document.getElementById('settingsSection')) return;

    try {
        const response = await fetch('/api/playlists');
        const data = await response.json();
        playlists = data;
        displayPlaylists();
        displayPlaylistFilters(); // Add this line
        return data;
    } catch (err) {
        console.error('Error fetching playlists:', err);
        return [];
    }
}
