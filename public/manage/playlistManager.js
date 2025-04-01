// public/manage/playlistManager.js
// Logic for playlist management, filtering, and playback selection

import { state, updateState } from '../state.js';
import { playSelectedPlaylist, updatePlaylist, deletePlaylist, addImagesToPlaylist, removeImageFromPlaylist } from '../api.js'; // Using available CRUD operations
// TODO: Refactor backend for individual playlist CRUD APIs
import { showPlaylistEditModal } from './modals.js';
import { handleError, ErrorTypes, withErrorHandling } from './errorHandler.js';
import { refreshManageData } from '../manage.js';
import { getContentColorForBackground } from './utils.js';

// DOM elements cached by parent manage.js module
let dom = {};
const DEFAULT_PLAYLIST_COLOR = '#8a3ffc'; // A default purple

export function setPlaylistManagerDOMCache(cachedDom) {
    dom = cachedDom;
    // Add checks for required elements used by *all* playlist functionalities
    if (!dom.playlistManagerSection || !dom.playlistList || !dom.newPlaylistForm || !dom.playlistSearchInput || // Manager section
        !dom.playlistFilterContainer || // Filter section
        !dom.settingsPlaylistList // Settings section
       ) {
        console.warn('PlaylistManager DOM Cache incomplete! Some features might fail.');
    }
}

// --- Playlist Manager Section UI --- (Add/Edit/Delete/Expand/Reorder)

/**
 * Creates a DOM element for a single playlist item in the manager section.
 * Includes drag/drop target, expand/collapse, edit/delete/play buttons.
 * @param {object} playlist - The playlist object.
 * @param {Array<object>} allImages - Array of all image objects (for thumbnail lookup).
 * @returns {HTMLElement} The playlist item element.
 */
function createManagerPlaylistItem(playlist, allImages) {
    const item = document.createElement('div');
    item.classList.add('playlist-item');
    item.setAttribute('data-playlist-id', playlist.id);
    item.setAttribute('draggable', true); // Make the item itself draggable (for reordering later if needed)
    if (playlist.hidden) {
        item.classList.add('hidden');
    }

    // Structure for header with actions and expand/collapse
    item.innerHTML = `
        <div class="playlist-header">
            <span class="playlist-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR};"></span>
            <span class="playlist-name">${playlist.name}</span>
            <span class="playlist-count">${playlist.imageIds.length}</span>
            <div class="playlist-actions">
                <button class="editPlaylistBtn bx--btn bx--btn--ghost bx--btn--icon-only" title="Edit Playlist" data-action="edit">
                     <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-3.6l2.6 2.6L11.4 19.6l-2.6-2.6L20.4 5.4zM6 22v-2.6l9-9 2.6 2.6-9 9H6z"></path></svg>
                </button>
                <button class="deletePlaylistBtn bx--btn bx--btn--ghost bx--btn--icon-only bx--btn--danger" title="Delete Playlist" data-action="delete">
                     <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>
                </button>
                 <button class="playPlaylistBtn bx--btn bx--btn--ghost bx--btn--icon-only" title="Play Playlist" data-action="play">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7527l-20,11A.9967.9967,0,0,1,7,28ZM9,7.6943V24.3057L24.1866,16Z"></path></svg>
                </button>
                <button class="expandBtn bx--btn bx--btn--ghost bx--btn--icon-only" title="Show/Hide Images" data-action="expand">
                     <svg class="expand-icon" focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 16 16"><path d="M8 11L3 6 3.7 5.3 8 9.6 12.3 5.3 13 6z"></path></svg>
                     <svg class="collapse-icon" style="display:none;" focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 16 16"><path d="M8 5l5 5-0.7 0.7-4.3-4.3-4.3 4.3-0.7-0.7z"></path></svg>
                </button>
            </div>
        </div>
        <div class="playlist-thumbnails" style="display: none;"></div>
    `;

    // --- Event Listeners for Manager Item --- //

    // Drag & Drop Target Handling
    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        handleAddDropToPlaylist(playlist.id, e.dataTransfer);
    });

    // Drag Source Handling (for reordering - TO BE IMPLEMENTED LATER if needed)
    item.addEventListener('dragstart', (e) => {
        // e.dataTransfer.setData('text/plain', playlist.id);
        // e.dataTransfer.effectAllowed = 'move';
        // item.classList.add('dragging');
        console.warn('Playlist reordering drag not fully implemented.');
    });
    // item.addEventListener('dragend', () => item.classList.remove('dragging'));

    // Delegated Action Button Clicks
    item.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        switch (action) {
            case 'edit':
                showPlaylistEditModal(playlist);
                break;
            case 'delete':
                handleDeletePlaylist(playlist);
                break;
            case 'play':
                handlePlayPlaylist(playlist.id);
                break;
            case 'expand':
                togglePlaylistExpansion(item, playlist, allImages);
                break;
        }
    });

    return item;
}

/**
 * Handles toggling the expanded state and loading thumbnails for a playlist item in the manager.
 * @param {HTMLElement} itemElement - The playlist item's main div.
 * @param {object} playlist - The playlist data.
 * @param {Array<object>} allImages - All image data for lookup.
 */
function togglePlaylistExpansion(itemElement, playlist, allImages) {
    const thumbnailsContainer = itemElement.querySelector('.playlist-thumbnails');
    const expandBtn = itemElement.querySelector('.expandBtn');
    const isExpanded = thumbnailsContainer.style.display === 'grid';

    thumbnailsContainer.style.display = isExpanded ? 'none' : 'grid';
    expandBtn.querySelector('.expand-icon').style.display = isExpanded ? 'block' : 'none';
    expandBtn.querySelector('.collapse-icon').style.display = isExpanded ? 'none' : 'block';
    expandBtn.classList.toggle('expanded', !isExpanded);
    itemElement.querySelector('.playlist-count').classList.toggle('expanded', !isExpanded);

    if (!isExpanded && thumbnailsContainer.innerHTML === '') { // Lazy load
        displayPlaylistThumbnails(thumbnailsContainer, playlist, allImages);
    }
}

/**
 * Populates the thumbnail container for an expanded playlist in the manager.
 */
function displayPlaylistThumbnails(container, playlist, allImages) {
    container.innerHTML = ''; // Clear
    if (!playlist.imageIds || playlist.imageIds.length === 0) {
        container.innerHTML = '<p>No images in this playlist.</p>';
        return;
    }
    const imageMap = new Map(allImages.map(img => [img.id, img]));
    playlist.imageIds.forEach(imageId => {
        const image = imageMap.get(imageId);
        if (image) {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.classList.add('thumbnail-wrapper');
            thumbWrapper.innerHTML = `
                <img src="${image.thumbnailUrl}" alt="${image.title}" class="playlist-thumbnail" loading="lazy">
                <button class="delete-thumbnail-btn bx--btn bx--btn--danger bx--btn--icon-only" title="Remove from Playlist" data-action="remove-image" data-image-id="${imageId}">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>
                </button>
            `;
            // Add listener for the remove button within the thumbnail
            thumbWrapper.querySelector('.delete-thumbnail-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const imageIdToRemove = parseInt(e.currentTarget.dataset.imageId, 10);
                await handleRemoveImageFromPlaylist(playlist.id, imageIdToRemove);
                // Refresh just this thumbnail section after removal
                const updatedPlaylist = state.playlists.find(p => p.id === playlist.id);
                if (updatedPlaylist) {
                    displayPlaylistThumbnails(container, updatedPlaylist, state.images); // Use current state images
                    const countElement = container.closest('.playlist-item').querySelector('.playlist-count');
                    if (countElement) countElement.textContent = updatedPlaylist.imageIds.length;
                }
            });
            container.appendChild(thumbWrapper);
        } else {
            console.warn(`Image ID ${imageId} found in playlist ${playlist.id} but not in image data.`);
        }
    });
}

/**
 * Displays playlists in the playlist manager section, filtered by search term.
 */
export function displayPlaylistsInManager() {
    if (!dom.playlistList) return;
    const searchTerm = dom.playlistSearchInput ? dom.playlistSearchInput.value.toLowerCase() : '';
    const playlists = state.playlists || [];
    const allImages = state.images || [];
    dom.playlistList.innerHTML = ''; // Clear
    const filteredPlaylists = playlists
        .filter(p => p.name.toLowerCase().includes(searchTerm))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (filteredPlaylists.length === 0) {
        dom.playlistList.innerHTML = '<p>No playlists found.</p>';
        return;
    }
    filteredPlaylists.forEach(playlist => {
        dom.playlistList.appendChild(createManagerPlaylistItem(playlist, allImages));
    });
}

// --- Playlist Filtering UI --- (Moved from filters.js)

/**
 * Displays playlists in the filter panel.
 */
export function displayPlaylistsInFilter() {
    const container = dom.playlistFilterContainer;
    if (!container) return;

    let scrollContainer = container.querySelector('.playlists-scroll-container');
    if (!scrollContainer) { // Create header and scroll container if they don't exist
        let header = container.querySelector('.playlist-filter-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'playlist-filter-header';
            header.innerHTML = `
                <div class="bx--search bx--search--sm" role="search">
                     <svg class="bx--search-magnifier" width="16" height="16" viewBox="0 0 16 16"><path d="M6.5 12a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm4.936-1.27l4.563 4.557-.707.708-4.563-4.558a6.5 6.5 0 1 1 .707-.707z" fill="currentColor"></path></svg>
                    <input type="text" class="bx--search-input playlist-filter-search" placeholder="Filter playlists..." aria-label="Filter playlists">
                    <button class="bx--search-close bx--search-close--hidden" title="Clear search input" aria-label="Clear search input">
                         <svg focusable="false" preserveAspectRatio="xMidYMid meet" style="will-change: transform;" xmlns="http://www.w3.org/2000/svg" class="bx--search-close__icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M12 4.7l-.7-.7L8 7.3 4.7 4l-.7.7L7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z"></path></svg>
                    </button>
                </div>
                <button class="bx--btn bx--btn--ghost bx--btn--sm playlist-deselect-btn" title="Deselect Playlist Filter">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.3,3.7H3.7C3.3,3.7,3,4,3,4.4v8.3c0,0.4,0.3,0.7,0.7,0.7h8.3c0.4,0,0.7-0.3,0.7-0.7V4.4 C13,4,12.7,3.7,12.3,3.7z M12,12.3H4V4.4h8V12.3z"></path></svg>
                    <span class="bx--assistive-text">Deselect Playlist Filter</span>
                </button>
            `;
            container.appendChild(header);
             // Add listeners for filter header controls
            const searchInput = header.querySelector('.playlist-filter-search');
            const clearSearchBtn = header.querySelector('.bx--search-close');
            searchInput.addEventListener('input', (e) => {
                filterPlaylistFilterView(e.target.value);
                clearSearchBtn.classList.toggle('bx--search-close--hidden', !e.target.value);
            });
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                filterPlaylistFilterView('');
                clearSearchBtn.classList.add('bx--search-close--hidden');
            });
            header.querySelector('.playlist-deselect-btn').addEventListener('click', handleDeselectPlaylistFilter);
        }
        scrollContainer = document.createElement('div');
        scrollContainer.className = 'playlists-scroll-container';
        container.appendChild(scrollContainer);
    }

    scrollContainer.innerHTML = ''; // Clear previous items
    const { selectedPlaylistId } = state.management;
    const playlists = state.playlists || [];
    const visiblePlaylists = playlists.filter(p => !p.hidden)
                                      .sort((a,b) => a.name.localeCompare(b.name));

    visiblePlaylists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'playlist-filter-item';
        item.setAttribute('data-playlist-id', playlist.id);
        if (playlist.id === selectedPlaylistId) item.classList.add('selected');
        item.innerHTML = `
            <span class="playlist-filter-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}"></span>
            <div class="playlist-filter-info">
                <span class="playlist-filter-name">${playlist.name}</span>
                <span class="playlist-filter-count">${playlist.imageIds.length}</span>
            </div>
        `;
        item.addEventListener('click', () => handleSelectPlaylistFilter(playlist.id, container));
        scrollContainer.appendChild(item);
    });
    filterPlaylistFilterView(container.querySelector('.playlist-filter-search').value);
}

/** Handles selecting a playlist filter. */
function handleSelectPlaylistFilter(playlistId, filterContainer) {
    // Update UI
    const previouslySelected = filterContainer.querySelector('.playlist-filter-item.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');
    const newlySelected = filterContainer.querySelector(`.playlist-filter-item[data-playlist-id="${playlistId}"]`);
    if (newlySelected) {
        newlySelected.classList.add('selected');
        // Show visual feedback
        newlySelected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update state and refresh data
    updateState('management', { 
        selectedPlaylistId: playlistId, 
        currentPage: 1,
        selectedImageIds: new Set() // Clear selection when changing filters
    });
    refreshManageData();

    // Update filter button state
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        filterBtn.classList.add('active');
        // Add visual indicator that a filter is active
        filterBtn.setAttribute('data-filter-active', 'true');
    }
}

/** Handles deselecting the playlist filter. */
function handleDeselectPlaylistFilter() {
    // Update UI
    const filterContainer = dom.playlistFilterContainer;
    if (filterContainer) {
        filterContainer.querySelectorAll('.playlist-filter-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }

    // Update state and refresh data
    updateState('management', { 
        selectedPlaylistId: null, 
        currentPage: 1,
        selectedImageIds: new Set() // Clear selection when changing filters
    });
    refreshManageData();

    // Update filter button state
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        filterBtn.removeAttribute('data-filter-active');
        // Only remove active class if no other filters are active
        if (!state.management.selectedFilterTags?.length) {
            filterBtn.classList.remove('active');
        }
    }
}

/** Filters the visible list of playlist filters based on search input. */
function filterPlaylistFilterView(searchTerm) {
    const term = searchTerm.toLowerCase();
    const container = dom.playlistFilterContainer?.querySelector('.playlists-scroll-container');
    if (!container) return;

    let hasVisibleItems = false;
    container.querySelectorAll('.playlist-filter-item').forEach(item => {
        const name = item.querySelector('.playlist-filter-name').textContent.toLowerCase();
        const isVisible = name.includes(term);
        item.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) hasVisibleItems = true;
    });

    // Show/hide no results message
    let noResultsMsg = container.querySelector('.no-results-message');
    if (!hasVisibleItems) {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('p');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.style.padding = '8px';
            noResultsMsg.style.color = 'var(--cds-text-secondary)';
            container.appendChild(noResultsMsg);
        }
        noResultsMsg.textContent = `No playlists matching "${searchTerm}"`;
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// --- Playlist Playback Selection (Settings Tab) --- (Moved from settings.js)

/** Displays playlists with play buttons in the settings tab. */
export function displayPlaylistsForSelection() {
     if (!dom.settingsPlaylistList) return;
    dom.settingsPlaylistList.innerHTML = ''; // Clear
    const allPlaylists = state.playlists || [];
    if (allPlaylists.length === 0) {
        dom.settingsPlaylistList.innerHTML = '<p class="bx--type-body-short-01">No playlists available.</p>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'settings-playlist-list';
    allPlaylists.forEach(playlist => {
        const listItem = document.createElement('li');
        listItem.className = 'settings-playlist-item bx--tile';
        listItem.innerHTML = `
            <span class="playlist-name">${playlist.name}</span>
            <button type="button" class="bx--btn bx--btn--sm bx--btn--primary play-playlist-settings-btn" data-playlist-id="${playlist.id}" style="margin-left: auto;">Play</button>
        `;
        listItem.querySelector('.play-playlist-settings-btn').addEventListener('click', handlePlayPlaylistClickForSettings);
        list.appendChild(listItem);
    });
    dom.settingsPlaylistList.appendChild(list);
}

/** Handles the click event for playlist play buttons *within the settings tab*. */
async function handlePlayPlaylistClickForSettings(event) {
    const button = event.target.closest('button');
    const playlistId = button?.dataset.playlistId;
    if (!playlistId || button.classList.contains('bx--btn--disabled')) return;
    console.log(`Settings: Playing playlist ID: ${playlistId}`);
    button.classList.add('bx--btn--disabled');
    button.setAttribute('disabled', true);
    const originalText = button.textContent;
    button.textContent = 'Starting...';
    try {
        await playSelectedPlaylist(parseInt(playlistId, 10));
    } catch (error) {
        console.error(`Error starting slideshow with playlist ID ${playlistId}:`, error);
        alert('Failed to start slideshow. Check console.');
    } finally {
        button.classList.remove('bx--btn--disabled');
        button.removeAttribute('disabled');
        button.textContent = originalText;
    }
}

// --- API Interaction Functions ---

/**
 * Creates a new playlist using available API functions.
 * Temporary workaround until a dedicated createPlaylist API is implemented.
 */
async function createPlaylistWorkaround(playlistData) {
    // Create a temporary ID - the server will assign a real one
    const tempId = `temp-${Date.now()}`; 
    const newPlaylist = {
        id: tempId,
        name: playlistData.name,
        color: playlistData.color || DEFAULT_PLAYLIST_COLOR,
        is_hidden: playlistData.hidden || false,
        imageIds: [], // Start with no images
        created_at: new Date().toISOString()
    };
    
    try {
        // Use updatePlaylist as a workaround - the backend should handle new playlists
        await updatePlaylist(tempId, newPlaylist);
        console.log(`Playlist "${playlistData.name}" created successfully.`);
        return tempId;
    } catch (error) {
        console.error('Error creating playlist:', error);
        throw error; // Re-throw for handling by caller
    }
}

async function handleAddNewPlaylist(event) {
    event.preventDefault();
    if (!dom.newPlaylistNameInput) return;
    const playlistName = dom.newPlaylistNameInput.value.trim();
    if (!playlistName) return;
    
    const currentPlaylists = state.playlists || [];
    if (currentPlaylists.some(p => p.name.toLowerCase() === playlistName.toLowerCase())) {
        alert(`Playlist "${playlistName}" already exists.`);
        return;
    }
    
    try {
        // Use our workaround function instead of a direct API call
        await createPlaylistWorkaround({ 
            name: playlistName, 
            color: DEFAULT_PLAYLIST_COLOR 
        });
        dom.newPlaylistForm.reset();
        await refreshManageData(); // Refresh data to show the new playlist
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles deleting a playlist
 */
async function handleDeletePlaylist(playlist) {
    if (!confirm(`Are you sure you want to delete playlist "${playlist.name}"? This cannot be undone.`)) {
        return;
    }

    try {
        await deletePlaylist(playlist.id);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles adding images to a playlist via drag and drop
 */
async function handleAddDropToPlaylist(playlistId, dataTransfer) {
    try {
        const data = JSON.parse(dataTransfer.getData('text/plain'));
        if (!data.imageIds || !Array.isArray(data.imageIds)) {
            throw new Error('Invalid drag data format');
        }
        await addImagesToPlaylist(playlistId, data.imageIds);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.VALIDATION);
    }
}

/**
 * Handles adding images to a playlist
 */
async function handleAddImagesToPlaylist(playlistId, imageIdsToAdd) {
    try {
        await addImagesToPlaylist(playlistId, imageIdsToAdd);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles removing an image from a playlist
 */
async function handleRemoveImageFromPlaylist(playlistId, imageIdToRemove) {
    try {
        await removeImageFromPlaylist(playlistId, imageIdToRemove);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles playing a playlist
 */
async function handlePlayPlaylist(playlistId) {
    try {
        const playlist = state.playlists.find(p => p.id === playlistId);
        if (!playlist) {
            throw new Error('Playlist not found');
        }
        await playSelectedPlaylist(playlistId);
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

// --- Initialization --- //

/** Attaches event listeners for playlist manager, filter, and settings controls. */
export function attachPlaylistManagerEventListeners() {
    // Manager Section Toggle
    if (dom.playlistManagerToggle && dom.playlistManagerSection) {
        dom.playlistManagerToggle.addEventListener('click', () => {
            const isActive = dom.playlistManagerToggle.classList.toggle('active');
            dom.playlistManagerSection.style.display = isActive ? 'block' : 'none';
            if (isActive) displayPlaylistsInManager(); // Refresh on show
        });
    }
    // Manager Section Add Form
    if (dom.newPlaylistForm) {
        dom.newPlaylistForm.addEventListener('submit', handleAddNewPlaylist);
    }
    // Manager Section Search
    if (dom.playlistSearchInput) {
        dom.playlistSearchInput.addEventListener('input', displayPlaylistsInManager);
    }
    // Note: Manager item actions (edit, delete, play, expand, drop, remove-image) are delegated or added dynamically.

    // Filter Section listeners are added dynamically in displayPlaylistsInFilter.

    // Settings Section listeners are added dynamically in displayPlaylistsForSelection.
}

// Main initialization function (called by manage.js)
export function initPlaylistManager() {
    console.log('[PlaylistManager] Initializing...');
    // Initial display for all sections happens via refreshManageData calling the display functions.
    // Listeners are attached via attachPlaylistManagerEventListeners called by manage.js.
} 