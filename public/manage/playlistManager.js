// public/manage/playlistManager.js
// Logic for playlist management, filtering, and playback selection

import { state, updateState } from '../state.js';
import { playSelectedPlaylist, updatePlaylist, deletePlaylist, addImagesToPlaylist, removeImageFromPlaylist, fetchImages, createPlaylistAPI } from '../api.js'; // Using available CRUD operations
// TODO: Refactor backend for individual playlist CRUD APIs
import { showPlaylistEditModal } from './modals.js';
import { handleError, ErrorTypes, withErrorHandling } from './errorHandler.js';
import { refreshManageData } from '../manage.js';
import { getContentColorForBackground } from './utils.js';
import { BACKGROUND_COLORS, DEFAULTS } from '../config.js'; // <-- Import BACKGROUND_COLORS
import { createFilterActionPill } from './filters.js'; // Import the helper function

// DOM elements cached by parent manage.js module
let dom = {};
// const DEFAULT_PLAYLIST_COLOR = '#8a3ffc'; // <-- Remove this default, we'll use the cycle

// --- State for Settings Playlist Selection ---
let settingsSelectedPlaylistIds = new Set();

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

// --- Helper Function to create Thumbnail Grid ---
/**
 * Creates a grid of image thumbnails for a playlist.
 * @param {object} playlist - The playlist object.
 * @param {Array<object>} imagesDataForGrid - Array of image objects fetched for this playlist.
 * @returns {HTMLDivElement} The div element containing the thumbnail grid.
 */
function createPlaylistThumbnailGrid(playlist, imagesDataForGrid) {
    console.log(`[Grid] Creating grid for playlist ${playlist.id}. Image IDs:`, playlist.imageIds, 'Received data:', imagesDataForGrid);
    const gridContainer = document.createElement('div');
    gridContainer.className = 'playlist-thumbnail-grid';

    if (!playlist.imageIds || playlist.imageIds.length === 0) {
        gridContainer.textContent = 'No images in this playlist.';
        gridContainer.style.padding = 'var(--cds-spacing-03)';
        gridContainer.style.color = 'var(--cds-text-02)';
        return gridContainer;
    }

    let imagesFoundCount = 0;
    playlist.imageIds.forEach(imageId => {
        // Find the image object in the data fetched specifically for this playlist
        const image = imagesDataForGrid.find(img => img && img.id === imageId);

        // --- DETAILED LOGGING --- >
        console.log(`[Grid Loop] Processing ID: ${imageId}`);
        console.log(`[Grid Loop] Found image object:`, image);
        if (image) {
            console.log(`[Grid Loop] image.thumbnailUrl exists?: ${image.hasOwnProperty('thumbnailUrl')}, Value:`, image.thumbnailUrl);
        } else {
            console.log(`[Grid Loop] Image object NOT found for ID ${imageId}`);
        }
        // < --- END LOGGING ---

        // The actual check to create the element
        if (image && image.thumbnailUrl) { // Check if image exists and has a non-empty thumbnailUrl
            imagesFoundCount++;
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'playlist-thumbnail-item';
            thumbWrapper.setAttribute('data-image-id', image.id); // Add image ID for removal reference

            const img = document.createElement('img');
            img.src = image.thumbnailUrl;
            img.alt = image.title || 'Playlist image';
            img.loading = 'lazy';
            thumbWrapper.appendChild(img);

            // Add Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-thumbnail-btn bx--btn bx--btn--ghost bx--btn--icon-only';
            deleteBtn.title = 'Remove from playlist';
            deleteBtn.innerHTML = `
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
                    <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
                </svg>`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent other clicks
                handleRemoveImageFromPlaylistClick(playlist.id, image.id, thumbWrapper);
            });
            thumbWrapper.appendChild(deleteBtn);

            gridContainer.appendChild(thumbWrapper);
        } else {
            // Keep this warning for clarity
            console.warn(`[Grid] Condition failed: Image data or thumbnail URL missing/invalid for ID: ${imageId}`);
        }
    });

    if (imagesFoundCount === 0 && playlist.imageIds.length > 0) {
        gridContainer.textContent = 'Could not load thumbnails for this playlist.';
         gridContainer.style.padding = 'var(--cds-spacing-03)';
         gridContainer.style.color = 'var(--cds-text-02)';
    }

    return gridContainer;
}

// --- Playlist Manager Section UI --- (Add/Edit/Delete/Expand/Reorder)

/**
 * Creates DOM elements for a single playlist item row and its details row.
 * @param {object} playlist - The playlist object.
 * @param {Array<object>} allImages - Array of all image objects (for thumbnail lookup).
 * @returns {DocumentFragment} A fragment containing the main row and the details row.
 */
function createManagerPlaylistItem(playlist, allImages) {
    const fragment = document.createDocumentFragment();

    // --- Main Playlist Row ---
    const row = document.createElement('tr');
    row.setAttribute('data-playlist-id', playlist.id);
    row.setAttribute('draggable', true);
    if (playlist.hidden) {
        row.classList.add('hidden-list');
    }

    // Cell for Playlist Name
    const nameCell = document.createElement('td');
    nameCell.classList.add('bx--table-cell');
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.innerHTML = `
        <span class="playlist-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: var(--cds-spacing-03);"></span>
            <span class="playlist-name">${playlist.name}</span>
    `;
    nameCell.appendChild(nameContainer);

    // Cell for Actions
    const actionsCell = document.createElement('td');
    actionsCell.classList.add('bx--table-cell');

    // Action buttons container
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'playlist-actions-container'; // Added class for easier styling

    // Clickable container for count and arrow
    const countToggleContainer = document.createElement('div');
    countToggleContainer.className = 'playlist-count-toggle';
    countToggleContainer.title = 'Toggle image thumbnails';
    countToggleContainer.innerHTML = `
        <svg class="playlist-toggle-arrow" focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 8L22 18 12 28z"></path>
        </svg>
        <span class="playlist-count">(${playlist.imageIds.length} images)</span>
    `;
    actionsContainer.appendChild(countToggleContainer);


    // -- Action Buttons (Edit, Visibility, Delete, Play) --
    const editBtn = document.createElement('button');
    editBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    editBtn.title = 'Edit playlist';
    editBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8 0 0 0 0 0 0l-3.6-3.6c-.8-.8-2-.8-2.8 0 0 0 0 0 0 0l-15 15V24h6.4L25.4 9zM20.4 4L24 7.6l-3 3L17.4 7 20.4 4zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path>
        </svg>`;
    editBtn.addEventListener('click', () => showPlaylistEditModal(playlist));

    const toggleHiddenBtn = document.createElement('button');
    toggleHiddenBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    toggleHiddenBtn.title = playlist.hidden ? 'Show playlist' : 'Hide playlist';
    toggleHiddenBtn.innerHTML = playlist.hidden ? `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
           <path d="M16 6C6.5 6 2 12.5 2 16s4.5 10 14 10 14-6.5 14-10S25.5 6 16 6zm0 18c-8.8 0-12-4.9-12-8s3.2-8 12-8 12 4.9 12 8-3.2 8-12 8z"></path>
           <path d="M16 10.5c-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5-2.5-5.5-5.5-5.5zm0 9c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"></path>
        </svg>` : `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M30.94,15.66A16.69,16.69,0,0,0,16,5,16.69,16.69,0,0,0,1.06,15.66a1,1,0,0,0,0,.68A16.69,16.69,0,0,0,16,27,16.69,16.69,0,0,0,30.94,16.34,1,1,0,0,0,30.94,15.66ZM16,25c-5.3,0-10.9-3.93-12.93-9C5.1,10.93,10.7,7,16,7s10.9,3.93,12.93,9C26.9,21.07,21.3,25,16,25Z"></path>
            <path d="M16,10a6,6,0,1,0,6,6A6,6,0,0,0,16,10Zm0,10a4,4,0,1,1,4-4A4,4,0,0,1,16,20Z"></path>
        </svg>`;
    toggleHiddenBtn.addEventListener('click', () => handleTogglePlaylistHidden(playlist.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only'; // Removed bx--btn--danger
    deleteBtn.title = 'Delete playlist';
    deleteBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
            <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
        </svg>`;
    deleteBtn.addEventListener('click', () => handleDeletePlaylist(playlist.id));

    const playBtn = document.createElement('button');
    playBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    playBtn.title = 'Play playlist';
    playBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M7 6l20 10L7 26z"></path>
        </svg>`;
    playBtn.addEventListener('click', () => handlePlayPlaylistClick(playlist.id));

    // Add buttons to container in the correct order
    actionsContainer.appendChild(editBtn);
    actionsContainer.appendChild(toggleHiddenBtn);
    actionsContainer.appendChild(deleteBtn);
    actionsContainer.appendChild(playBtn);

    // Add container to cell
    actionsCell.appendChild(actionsContainer);

    // Add cells to row
    row.appendChild(nameCell);
    row.appendChild(actionsCell);

    // --- Details Row (Initially Hidden) ---
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'playlist-details-row';
    detailsRow.style.display = 'none'; // Hide initially
    detailsRow.setAttribute('data-playlist-id', playlist.id);

    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 2; // Span across both columns
    detailsRow.appendChild(detailsCell);

    // --- Event Listeners ---

    // Add listener for the count/arrow toggle (make it async)
    countToggleContainer.addEventListener('click', async () => { // Added async
        const isHidden = detailsRow.style.display === 'none';

        // Populate content only on first expansion
        if (isHidden && detailsCell.dataset.populated !== 'true') {
            detailsCell.textContent = 'Loading thumbnails...'; // Show loading indicator
            try {
                // Fetch images specifically for this playlist
                console.log(`[Toggle] Fetching images for playlist ${playlist.id}, IDs:`, playlist.imageIds);
                const limit = playlist.imageIds.length > 0 ? playlist.imageIds.length : 50; // Ensure limit is at least 1, or reasonable default
                const imageData = await fetchImages({ filters: { ids: playlist.imageIds }, limit: limit });
                const imagesForPlaylist = imageData.images || [];
                console.log(`[Toggle] Received image data for playlist ${playlist.id}:`, imagesForPlaylist);

                detailsCell.innerHTML = ''; // Clear loading message
                // Pass the fetched images to the grid creation function
                detailsCell.appendChild(createPlaylistThumbnailGrid(playlist, imagesForPlaylist));
                detailsCell.dataset.populated = 'true'; // Mark as populated
            } catch (error) {
                console.error(`Error fetching images for playlist ${playlist.id}:`, error);
                detailsCell.textContent = 'Error loading thumbnails.';
                detailsCell.style.color = 'var(--cds-support-error)';
                // Don't mark as populated on error, allow retry
            }
        }

        // Toggle display
        detailsRow.style.display = isHidden ? 'table-row' : 'none';

        // Toggle arrow icon
        const arrowSvg = countToggleContainer.querySelector('svg');
        if (arrowSvg) {
            arrowSvg.innerHTML = isHidden ?
                '<path d="M24 12L16 22 8 12z"></path>' : // Down arrow
                '<path d="M12 8l10 10-10 10z"></path>'; // Right arrow
        }
    });

    // Add click listener to the ROW itself for adding selected images
    row.addEventListener('click', async (e) => {
        // Ignore clicks on buttons or the expand toggle
        if (e.target.closest('button') || e.target.closest('.playlist-count-toggle')) {
        return;
    }

        const selectedIds = Array.from(state.management.selectedImageIds);
        if (selectedIds.length > 0) {
            console.log(`[Playlist Row Click] Adding ${selectedIds.length} selected images to playlist ${playlist.id}`);
            try {
                await addImagesToPlaylist(playlist.id, selectedIds);
                state.management.selectedImageIds.clear(); // Clear selection after adding
                await refreshManageData(); // Refresh to update counts etc.
                // Optional: Provide success feedback (e.g., Carbon toast)
            } catch (error) {
                handleError(error, ErrorTypes.SERVER, `Failed to add images to playlist "${playlist.name}"`);
            }
        } else {
            // Optional: If no images are selected, maybe toggle the details row?
            // countToggleContainer.click(); // Simulate click on toggle
            console.log(`[Playlist Row Click] No images selected for playlist ${playlist.id}`);
        }
    });

    // Drag and Drop for Main Row
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);

    // Append both rows to the fragment
    fragment.appendChild(row);
    fragment.appendChild(detailsRow);

    return fragment;
}

/**
 * Displays playlists in the playlist manager section, filtered by search term.
 */
export function displayPlaylistsInManager() {
    if (!dom.playlistList) return;
    const searchTerm = dom.playlistSearchInput ? dom.playlistSearchInput.value.toLowerCase() : '';
    const playlists = state.playlists || [];
    const allImages = state.management?.displayedImages || []; // Use images from management state for consistency
    dom.playlistList.innerHTML = ''; // Clear

    const filteredPlaylists = playlists
        .filter(p => p.name.toLowerCase().includes(searchTerm))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (filteredPlaylists.length === 0) {
        // Add a row indicating no results, matching table structure
        const noResultRow = dom.playlistList.insertRow();
        const cell = noResultRow.insertCell();
        cell.colSpan = 2; // Span columns
        cell.textContent = 'No playlists found.';
        cell.style.textAlign = 'center';
        cell.style.padding = 'var(--cds-spacing-05)';
        cell.style.color = 'var(--cds-text-02)';
        return;
    }

    filteredPlaylists.forEach(playlist => {
        // Append the fragment containing both rows
        dom.playlistList.appendChild(createManagerPlaylistItem(playlist, allImages));
    });
}

// --- Playlist Filtering UI --- (Moved from filters.js)

/**
 * Displays playlists in the filter section.
 */
export function displayPlaylistsInFilter() {
    if (!dom.playlistFilterContainer) return;
    dom.playlistFilterContainer.innerHTML = ''; // Clear existing

    // Header with search and deselect button
    const header = document.createElement('div');
            header.className = 'playlist-filter-header';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'playlist-filter-search-input';
    searchInput.placeholder = 'Filter playlists...';
    searchInput.className = 'bx--text-input bx--text-input--sm'; // Use Carbon styling
    searchInput.addEventListener('input', (e) => filterPlaylistFilterView(e.target.value));

    // Create Deselect button as a Carbon icon button
    const deselectBtn = document.createElement('button');
    deselectBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only playlist-deselect-btn'; // Added specific class back
    deselectBtn.title = 'Deselect Playlist Filter';
    deselectBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
            <title>Deselect Playlist Filter</title> <!-- Added title element -->
        </svg>
    `;
    deselectBtn.addEventListener('click', handleDeselectPlaylistFilter);
    deselectBtn.style.marginLeft = 'auto'; // Push to the right

    header.appendChild(searchInput);
    header.appendChild(deselectBtn);
    dom.playlistFilterContainer.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.className = 'playlists-scroll-container'; // For scrolling

    const currentPlaylists = state.playlists || [];
    if (currentPlaylists.length === 0) {
        listContainer.innerHTML = '<p class="bx--type-body-short-01">No playlists available.</p>';
        dom.playlistFilterContainer.appendChild(listContainer);
        return;
    }

    const selectedId = state.management.selectedPlaylistId; // Use single ID

    currentPlaylists
        // Filter out hidden AND empty playlists
        .filter(p => !p.hidden && p.imageIds && p.imageIds.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'playlist-filter-item';
            item.dataset.playlistId = playlist.id;
            item.dataset.playlistName = playlist.name.toLowerCase(); // For search filtering

            // Highlight if selected (compare with single ID)
            if (selectedId === playlist.id) { 
                item.classList.add('selected');
            }

            // Color indicator
            const colorIndicator = document.createElement('span');
            colorIndicator.className = 'playlist-filter-color';
            colorIndicator.style.backgroundColor = playlist.color || '#cccccc';

            // Playlist Info (showing image count)
            const infoDiv = document.createElement('div');
            infoDiv.className = 'playlist-filter-info';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'playlist-filter-name';
            nameSpan.textContent = playlist.name;
            const countSpan = document.createElement('span');
            countSpan.className = 'playlist-filter-count';
            countSpan.textContent = `(${(playlist.imageIds || []).length})`; // Show image count
            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(countSpan);

            item.appendChild(colorIndicator);
            item.appendChild(infoDiv);

            // Click listener to select this playlist
            item.addEventListener('click', () => handleSelectPlaylistFilter(playlist.id));

            listContainer.appendChild(item);
        });

    dom.playlistFilterContainer.appendChild(listContainer);
    // Apply search term if input exists
    const currentSearchValue = header.querySelector('#playlist-filter-search-input')?.value;
    if (currentSearchValue) {
        filterPlaylistFilterView(currentSearchValue);
    }
}

/**
 * Handles clicking a playlist in the filter view (sets single selection).
 */
function handleSelectPlaylistFilter(playlistId) {
    console.log('Selecting playlist filter:', playlistId);
    // Update state with the selected playlist ID
    updateState('management', { selectedPlaylistId: playlistId, currentPage: 1 }); // Reset page
    // Refresh the playlist filter view to highlight the selection
    displayPlaylistsInFilter(); 
    // Trigger a refresh of the image data based on the new filter
    refreshManageData(); 
}

/**
 * Handles clicking the deselect button in the playlist filter view.
 */
function handleDeselectPlaylistFilter() {
    console.log('Deselecting playlist filter');
    // Update state to remove the selected playlist ID
    updateState('management', { selectedPlaylistId: null, currentPage: 1 }); // Reset page
    // Refresh the playlist filter view to remove the highlight
    displayPlaylistsInFilter();
    // Trigger a refresh of the image data without the playlist filter
    refreshManageData();
}

/**
 * Filters the playlist list in the **Filter** section based on search input.
 */
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

// --- Playlist Playback Selection (Settings Tab) ---

/** Displays playlists for selection in the settings tab. */
export function displayPlaylistsForSelection() {
    const container = dom.settingsPlaylistList; 
    const controlsContainer = document.getElementById('settingsPlaylistSelectionBtns');
    if (!container || !controlsContainer) {
        console.warn('Settings playlist list or controls container not found in DOM cache.');
        return;
    }
    container.innerHTML = ''; 
    controlsContainer.innerHTML = ''; 
    // Initialize local set from global state
    settingsSelectedPlaylistIds = new Set(state.management.selectedSettingPlaylistIds || []); 

    const allPlaylists = (state.playlists || [])
        .filter(p => !p.hidden && p.imageIds && p.imageIds.length > 0); 

    // --- Add Select/Deselect Buttons --- 
    const selectAllBtn = createSettingsPlaylistActionButton('Select All', true, () => {
        settingsSelectedPlaylistIds.clear(); // Clear first
        container.querySelectorAll('.settings-playlist-item').forEach(item => {
            if (item.style.display !== 'none') { 
                item.classList.add('selected');
                settingsSelectedPlaylistIds.add(parseInt(item.dataset.playlistId, 10));
            }
        });
        // Update global state
        updateState('management', { selectedSettingPlaylistIds: Array.from(settingsSelectedPlaylistIds) });
    });
    controlsContainer.appendChild(selectAllBtn);

    const deselectAllBtn = createSettingsPlaylistActionButton('Deselect All', false, () => {
        container.querySelectorAll('.settings-playlist-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        settingsSelectedPlaylistIds.clear();
        // Update global state
        updateState('management', { selectedSettingPlaylistIds: [] });
    });
    controlsContainer.appendChild(deselectAllBtn);
    // --- ------------------------ --- 

    if (allPlaylists.length === 0) {
        container.innerHTML = '<p class="bx--type-body-short-01">No playlists with images available.</p>'; 
        return;
    }

    allPlaylists.sort((a, b) => a.name.localeCompare(b.name));

    allPlaylists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'settings-playlist-item playlist-filter-item'; 
        item.setAttribute('data-playlist-id', playlist.id);
        
        const imageCountText = `(${playlist.imageIds.length} image${playlist.imageIds.length !== 1 ? 's' : ''})`;
        
        item.innerHTML = `
            <span class="playlist-filter-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}"></span>
            <div class="playlist-filter-info">
                <span class="playlist-filter-name">${playlist.name}</span>
                <span class="playlist-filter-count">${imageCountText}</span>
            </div>
        `;
        
        // Set initial selection state from global state
        if (settingsSelectedPlaylistIds.has(playlist.id)) {
            item.classList.add('selected');
        }

        // Click listener for selection
        item.addEventListener('click', () => {
            // Allow only single selection for now?
            // Deselect all others first if clicking a new one
            if (!item.classList.contains('selected')) {
                 container.querySelectorAll('.settings-playlist-item.selected').forEach(other => other.classList.remove('selected'));
                 settingsSelectedPlaylistIds.clear();
                 item.classList.add('selected');
                 settingsSelectedPlaylistIds.add(playlist.id);
            } else { // Clicked the already selected one - deselect it
                 item.classList.remove('selected');
                 settingsSelectedPlaylistIds.delete(playlist.id);
            }

            // const isSelected = item.classList.toggle('selected');
            // const playlistId = parseInt(playlist.id, 10);
            // if (isSelected) {
            //     settingsSelectedPlaylistIds.add(playlistId);
            // } else {
            //     settingsSelectedPlaylistIds.delete(playlistId);
            // }
            
            // Update global state
            updateState('management', { selectedSettingPlaylistIds: Array.from(settingsSelectedPlaylistIds) });
            console.log('Updated global state - selectedSettingPlaylistIds:', state.management.selectedSettingPlaylistIds);
        });
        
        container.appendChild(item);
    });

    const searchInput = document.getElementById('settingsPlaylistSearch');
    if (searchInput) {
        filterSettingsPlaylistsView(searchInput.value);
    }
}

/** Helper to create action buttons for settings playlist selection */
function createSettingsPlaylistActionButton(text, isPrimary, onClick) { 
    const btn = document.createElement('button');
    btn.className = `bx--btn bx--btn--sm ${isPrimary ? 'bx--btn--primary' : 'bx--btn--secondary'}`;
    btn.type = 'button'; 
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

/** Filters the visible list of playlists in the settings tab. */
function filterSettingsPlaylistsView(searchTerm) {
    const term = searchTerm.toLowerCase();
    const container = dom.settingsPlaylistList; // The list container
    if (!container) return;

    let hasVisibleItems = false;
    container.querySelectorAll('.settings-playlist-item').forEach(item => {
        const name = item.querySelector('.playlist-filter-name')?.textContent.toLowerCase() || '';
        const isVisible = name.includes(term);
        item.style.display = isVisible ? 'flex' : 'none'; // Use flex to match playlist-filter-item style
        if (isVisible) hasVisibleItems = true;
    });

    // Show/hide no results message (similar to filter panel)
    let noResultsMsg = container.querySelector('.no-results-message');
    if (!hasVisibleItems && allPlaylists.length > 0) { // Only show if there were playlists to begin with
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('p');
            noResultsMsg.className = 'no-results-message bx--type-body-short-01';
            noResultsMsg.style.padding = 'var(--cds-spacing-03)';
            noResultsMsg.style.color = 'var(--cds-text-secondary)';
            container.appendChild(noResultsMsg);
        }
        noResultsMsg.textContent = `No playlists matching "${searchTerm}"`;
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// --- API Interaction Functions ---

/**
 * Handles form submission for adding a new playlist.
 */
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
        // *** ADD Color Cycling Logic ***
        let colorIndex = parseInt(localStorage.getItem('nextPlaylistColorIndex') || '0', 10);
        const playlistColor = BACKGROUND_COLORS[colorIndex % BACKGROUND_COLORS.length] || DEFAULTS.TAG_COLOR; // Fallback to default tag color
        const nextIndex = (colorIndex + 1) % BACKGROUND_COLORS.length;
        localStorage.setItem('nextPlaylistColorIndex', nextIndex.toString());
        // *** END Color Cycling Logic ***

        // *** FIX: Pass name string directly, and determined color ***
        const newPlaylist = await createPlaylistAPI(playlistName, playlistColor); // Pass name and color
        dom.newPlaylistNameInput.value = ''; // Clear input on success
        await refreshManageData();
        console.log('New playlist created:', newPlaylist);
    } catch (error) {
        handleError(error, ErrorTypes.SERVER, 'Failed to create new playlist');
    }
}

/**
 * Handles deleting a playlist
 */
async function handleDeletePlaylist(playlistId) {
    const playlist = state.playlists.find(p => p.id === playlistId);
    if (!playlist) {
        handleError(new Error('Playlist not found'), ErrorTypes.NOT_FOUND);
        return;
    }

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
 * Handles toggling the hidden state of a playlist.
 * @param {number} playlistId - The ID of the playlist to toggle.
 */
async function handleTogglePlaylistHidden(playlistId) {
    const playlist = state.playlists.find(p => p.id === playlistId);
    if (!playlist) {
        handleError(new Error('Playlist not found'), ErrorTypes.NOT_FOUND);
        return;
    }

    const newHiddenState = !playlist.hidden;

    try {
        await updatePlaylist(playlistId, { is_hidden: newHiddenState });
        await refreshManageData(); // Refresh UI
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles playing a playlist by its ID.
 * @param {number} playlistId - The ID of the playlist to play.
 */
async function handlePlayPlaylistClick(playlistId) {
    // Directly call the API to play this specific playlist
    console.log(`Playlist Manager: Playing playlist ID ${playlistId} directly.`);
    try {
        await playSelectedPlaylist(parseInt(playlistId, 10));
        console.log(`Play request sent for playlist ID ${playlistId}`);
        // Optional: Add visual feedback (e.g., button temporarily disabled)
    } catch (error) {
        // Use the imported error handler if available, otherwise basic alert
        if (typeof handleError === 'function') {
             handleError(error, ErrorTypes.SERVER, `Failed to start slideshow for playlist: ${error.message}`);
        } else {
             console.error(`Error playing playlist ID ${playlistId}:`, error);
             alert(`Failed to start slideshow for playlist: ${error.message}`);
        }
    }
}

// --- Drag and Drop Handlers for Playlist Rows ---

/**
 * Handles drag starting on a playlist row (for future reordering).
 * @param {DragEvent} e - The drag event.
 */
function handleDragStart(e) {
    // If implementing reordering:
    // const playlistId = e.target.closest('tr')?.dataset.playlistId;
    // if (playlistId) {
    //     e.dataTransfer.setData('text/plain', playlistId);
    //     e.dataTransfer.effectAllowed = 'move';
    //     e.target.closest('tr').classList.add('dragging');
    // }
    console.warn('Playlist reordering drag not implemented yet.');
    // Prevent dragging for now if not implemented
    e.preventDefault();
}

/**
 * Handles dragging over a playlist row (target for adding images).
 * @param {DragEvent} e - The drag event.
 */
function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    const row = e.target.closest('tr');
    if (row) {
        row.classList.add('bx--data-table--drag-over');
    }
    e.dataTransfer.dropEffect = 'copy'; // Indicate copying is allowed
}

/**
 * Handles dragging leaving a playlist row target.
 * @param {DragEvent} e - The drag event.
 */
function handleDragLeave(e) {
    const row = e.target.closest('tr');
    if (row) {
        row.classList.remove('bx--data-table--drag-over');
    }
}

/**
 * Handles dropping data (images) onto a playlist row.
 * @param {DragEvent} e - The drag event.
 */
async function handleDrop(e) {
    e.preventDefault();
    const row = e.target.closest('tr');
    const playlistId = parseInt(row?.dataset.playlistId, 10);

    if (row) {
        row.classList.remove('bx--data-table--drag-over');
    }

    if (!playlistId) {
        console.error('Could not determine playlist ID on drop.');
        return;
    }

    try {
        // Assuming data is JSON stringified image IDs from imageManager.js
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (!data.imageIds || !Array.isArray(data.imageIds)) {
            throw new Error('Invalid drag data format for images.');
        }
        console.log(`Dropping ${data.imageIds.length} images onto playlist ${playlistId}`);
        await addImagesToPlaylist(playlistId, data.imageIds);
        await refreshManageData(); // Refresh playlist list and potentially image table tags
        // Add success feedback?
    } catch (error) {
        handleError(error, ErrorTypes.VALIDATION, 'Failed to add images to playlist from drop.');
    }
}

/**
 * Handles removing an image from a specific playlist (called from thumbnail delete button).
 * @param {number} playlistId - The ID of the playlist.
 * @param {number} imageId - The ID of the image to remove.
 * @param {HTMLElement} thumbWrapperElement - The DOM element of the thumbnail to remove visually.
 */
async function handleRemoveImageFromPlaylistClick(playlistId, imageId, thumbWrapperElement) {
    console.log(`Attempting to remove image ${imageId} from playlist ${playlistId}`);
    // Optionally disable the button or show a loading state on the thumbnail
    const deleteButton = thumbWrapperElement.querySelector('.delete-thumbnail-btn');
    if (deleteButton) deleteButton.disabled = true;

    try {
        await removeImageFromPlaylist(playlistId, imageId);
        // Remove the thumbnail from the grid immediately
        thumbWrapperElement.remove();
        console.log(`Image ${imageId} removed from playlist ${playlistId} visually.`);
        // TODO: Update the playlist count in the main row UI?
        // await refreshManageData(); // <-- Comment out this line
    } catch (error) {
        handleError(error, ErrorTypes.SERVER, `Failed to remove image ${imageId} from playlist ${playlistId}`);
        // Re-enable button on error
        if (deleteButton) deleteButton.disabled = false;
    }
}

// --- Initialization --- //

/** Attaches event listeners for playlist manager, filter, and settings controls. */
export function attachPlaylistManagerEventListeners() {
    // Manager Section Toggle - REMOVED (handled by manage.js)
    // if (dom.playlistManagerToggle && dom.playlistManagerSection) { ... }
    
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

    // ADD Listeners for Settings Playlist Search
    const searchInput = document.getElementById('settingsPlaylistSearch');
    const clearSearchBtn = searchInput?.parentElement.querySelector('.bx--search-close');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSettingsPlaylistsView(e.target.value);
            clearSearchBtn?.classList.toggle('bx--search-close--hidden', !e.target.value);
        });
    }
    if(clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if(searchInput) searchInput.value = '';
            filterSettingsPlaylistsView('');
            clearSearchBtn.classList.add('bx--search-close--hidden');
        });
    }

    // Select/Deselect button listeners are added dynamically
}

// Main initialization function (called by manage.js)
export function initPlaylistManager() {
    console.log('Initializing Playlist Manager...');
    // Initialize state if needed (assuming state module handles defaults)
    // if (state.management.selectedPlaylistIds === undefined) {
    //     updateState('management', { selectedPlaylistIds: [] }); 
    // }
    attachPlaylistManagerEventListeners(); 
    // Initial display calls are handled by refreshManageData
} 