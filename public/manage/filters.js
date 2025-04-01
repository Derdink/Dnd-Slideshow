// public/manage/filters.js
// Logic for search input and tag filtering UI

import { state, updateState } from '../state.js';
import { refreshManageData } from '../manage.js'; // Need main refresh function
import { getContentColorForBackground } from './utils.js';

// DOM elements cached by parent manage.js module
let dom = {};
const DEFAULT_TAG_COLOR = '#FF4081'; // Consider moving constants to utils or config

export function setFiltersDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Displays tags in the filter dropdown.
 */
export function displayTagsInFilter(tags) {
    if (!dom.tagFilterDropdown) return;
    dom.tagFilterDropdown.innerHTML = ''; // Clear existing
    const sortedTags = tags.filter(t => t.name?.toLowerCase() !== 'all') // Keep 'Hidden'
                           .sort((a, b) => a.name.localeCompare(b.name));

    // Add "Clear Filters" pill
    const clearBtn = createFilterActionPill('Clear Filters', '#6f6f6f', () => {
        updateState('management', { selectedFilterTags: [] });
        dom.tagFilterDropdown.querySelectorAll('.tag-pill.filter-tag').forEach(p => {
            p.classList.remove('selected');
            p.style.opacity = '0.7'; // Reset opacity
        });
        refreshManageData(); // Fetch data with cleared filters
    });
    clearBtn.id = "clearFilter";
    dom.tagFilterDropdown.appendChild(clearBtn);

    sortedTags.forEach(tag => {
        const tagKey = tag.name.toLowerCase();
        const pill = createFilterActionPill(tag.name, tag.color || DEFAULT_TAG_COLOR, () => {
            const currentFilters = [...state.management.selectedFilterTags]; // Clone
            const index = currentFilters.indexOf(tagKey);
            if (index === -1) {
                currentFilters.push(tagKey);
            } else {
                currentFilters.splice(index, 1);
            }
            updateState('management', { selectedFilterTags: currentFilters, currentPage: 1 }); // Reset page
            refreshManageData(); // Fetch data with new filters
        });
        pill.classList.add('filter-tag'); // Mark as filter pill
        pill.setAttribute('data-tag-key', tagKey);
        // Set initial selected state
        if (state.management.selectedFilterTags.includes(tagKey)) {
            pill.classList.add('selected');
            pill.style.opacity = '1';
        } else {
             pill.style.opacity = '0.7';
        }
        dom.tagFilterDropdown.appendChild(pill);
    });
    updateFilterTagAvailability(); // Initial update after populating
}

/**
 * Helper to create a generic pill for filter actions.
 */
function createFilterActionPill(text, color, onClick) {
    const pill = document.createElement('div');
    pill.classList.add('tag-pill', 'action-pill'); // Add specific class
    const contrastColor = getContentColorForBackground(color);
    pill.style.setProperty('--pill-bg-color', color);
    pill.style.setProperty('--pill-text-color', contrastColor);
    pill.style.cursor = 'pointer';
    pill.textContent = text;
    pill.addEventListener('click', onClick);
    return pill;
}

/**
 * Updates filter tag visual state (availability/opacity) based on currently displayed images.
 */
export function updateFilterTagAvailability() {
    if (!dom.tagFilterDropdown) return;
    const displayedImages = state.management.displayedImages;
    const selectedFilters = state.management.selectedFilterTags;

    // Calculate available tags *from the currently displayed images*
    const availableTagIdsInDisplay = new Set();
    displayedImages.forEach(img => {
        (img.tagIds || []).forEach(tagId => availableTagIdsInDisplay.add(tagId));
    });

    dom.tagFilterDropdown.querySelectorAll('.tag-pill.filter-tag').forEach(pill => {
        const tagKey = pill.getAttribute('data-tag-key');
        const tag = state.tags.find(t => t.name.toLowerCase() === tagKey);
        if (!tag) return; // Skip if tag not found (shouldn't happen)

        const isSelected = selectedFilters.includes(tagKey);
        const isAvailable = availableTagIdsInDisplay.has(tag.id);

        // Update visual state: selected, available, unavailable
        pill.classList.toggle('selected', isSelected);
        pill.classList.toggle('unavailable', !isAvailable && !isSelected); // Mark as unavailable if not selected and not present
        pill.style.opacity = isSelected ? '1' : (isAvailable ? '0.7' : '0.3');
        pill.style.pointerEvents = (isAvailable || isSelected) ? 'auto' : 'none'; // Allow clicking selected/available
    });
}

/**
 * Attaches event listeners for filter controls (search, filter toggle button).
 */
export function attachFilterEventListeners() {
     // Search Input
    if (dom.searchInput) {
        let debounceTimer;
        dom.searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                 updateState('management', { currentPage: 1, currentSearchTerm: dom.searchInput.value }); // Reset page, update search term
                 refreshManageData();
            }, 300); // Debounce search input
        });
        // Clear button for search
        const clearSearchBtn = dom.searchInput.parentNode.querySelector('.bx--search-close');
        if(clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                 dom.searchInput.value = '';
                 clearSearchBtn.classList.add('bx--search-close--hidden');
                 updateState('management', { currentPage: 1, currentSearchTerm: '' });
                 refreshManageData();
            });
            dom.searchInput.addEventListener('input', () => {
                 clearSearchBtn.classList.toggle('bx--search-close--hidden', !dom.searchInput.value);
            });
        }
    }

    // Filter Button
    if (dom.filterBtn && dom.filterTabsWrapper) {
        dom.filterBtn.addEventListener('click', () => {
            const isActive = dom.filterBtn.classList.toggle('active'); // Toggle active class for styling
            dom.filterTabsWrapper.style.display = isActive ? 'flex' : 'none'; // Use flex
             if (isActive) {
                 // Refresh filters when opening
                 displayTagsInFilter(state.tags || []);
                 // Playlist filters are now handled by playlistManager.js
                 // displayPlaylistFilters(state.playlists || []);
             }
        });
    }

    // NOTE: Event listeners for filter pills themselves are added dynamically in displayTagsInFilter
}

/**
 * Initializes the filter components.
 */
export function initFilters() {
    console.log('Initializing Filters...');
    attachFilterEventListeners();
    // Initial display of filters is handled by refreshManageData calling displayTagsInFilter/displayPlaylistFilters
} 