/**
 * settings.js
 * Implements slideshow settings functionality based on user stories:
 * - Slideshow Management User Story 1: Manage slideshow settings
 * - Slideshow Management User Story 2: Slideshow controls
 * - Slideshow Management User Story 3: Tag selection for slideshow
 * - Slideshow Management User Story 4: Customize sequence settings
 */

// public/manage/settings.js
// Logic for the Play Settings tab

import { state, updateState } from '../state.js';
import { updateSlideshowSettings, playSelectedTags, playSelectedPlaylist } from '../api.js';
import '../socket-client.js'; // Import socket-client.js which exposes socket as window.socket
import { STORAGE_KEYS, DEFAULTS, UI } from '../config.js';

// DOM elements cached by parent manage.js module
let dom = {};
// Get the socket from the global window object
const socket = window.socket;

export function setSettingsDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Loads current slideshow settings into form fields
 * Used by Slideshow Management User Story 1 for settings display
 */
function loadSettingsValues() {
    if (!dom.minutesInput || !dom.secondsInput || !dom.orderRandomBtn || !dom.orderAlphaBtn || !dom.orderGroupsBtn) {
        console.warn('Settings DOM elements not fully cached.');
        return;
    }

    // Load transition time
    const currentTransitionTime = state.slideshow?.transitionTime ?? 
        parseFloat(localStorage.getItem(STORAGE_KEYS.TRANSITION_TIME)) ?? 
        DEFAULTS.TRANSITION_TIME;
    const totalSeconds = Math.max(0, Math.round(currentTransitionTime));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    dom.minutesInput.value = minutes;
    dom.secondsInput.value = seconds;

    // Load order
    const currentOrder = state.slideshow?.order ?? 
        localStorage.getItem(STORAGE_KEYS.SLIDESHOW_ORDER) ?? 
        DEFAULTS.SLIDESHOW_ORDER;
    updateOrderButtonSelection(currentOrder);
}

/**
 * Updates visual selection state of order buttons
 * Implements Slideshow Management User Story 4:
 * - Random order
 * - Alphabetical order
 * - Tag-based order
 */
function updateOrderButtonSelection(selectedOrder) {
    const buttons = {
        random: dom.orderRandomBtn,
        alphabetical: dom.orderAlphaBtn,
        groups: dom.orderGroupsBtn
    };

    // Reset all buttons (remove primary, add secondary)
    Object.values(buttons).forEach(btn => {
        if (btn) {
            btn.classList.remove('bx--btn--primary');
            btn.classList.add('bx--btn--secondary');
        }
    });

    // Activate the selected button (remove secondary, add primary)
    const selectedButton = buttons[selectedOrder];
    if (selectedButton) {
        selectedButton.classList.remove('bx--btn--secondary');
        selectedButton.classList.add('bx--btn--primary');
    }
}

/**
 * Handles order button clicks
 * Used by Slideshow Management User Story 4 for sequence ordering
 */
function handleOrderButtonClick(event) {
    const clickedButton = event.target.closest('button');
    if (!clickedButton) return;

    const newOrder = clickedButton.id.replace('order', '').toLowerCase();
    updateOrderButtonSelection(newOrder);
    // No need to save immediately, wait for the main save button
}

/**
 * Handles saving slideshow settings
 * Implements Slideshow Management User Story 1:
 * - Auto-update slideshow on changes
 * - Save transition duration
 * - Save sequence order
 */
async function handleSaveSettings() {
    if (!dom.minutesInput || !dom.secondsInput || !dom.orderRandomBtn) {
        console.warn('Cannot save settings, DOM elements missing.');
        return;
    }

    // Get transition time
    const minutes = parseInt(dom.minutesInput.value, 10) || 0;
    const seconds = parseInt(dom.secondsInput.value, 10) || 0;
    const newTransitionTime = Math.max(1, (minutes * 60) + seconds);

    // Get order
    let newOrder = DEFAULTS.SLIDESHOW_ORDER;
    if (dom.orderAlphaBtn?.classList.contains('bx--btn--primary')) {
        newOrder = 'alphabetical';
    } else if (dom.orderGroupsBtn?.classList.contains('bx--btn--primary')) {
        newOrder = 'groups';
    }

    console.log(`Saving settings: Time=${newTransitionTime}s, Order=${newOrder}`);

    try {
        updateState('slideshow', {
            transitionTime: newTransitionTime,
            order: newOrder
        });

        localStorage.setItem(STORAGE_KEYS.TRANSITION_TIME, newTransitionTime.toString());
        localStorage.setItem(STORAGE_KEYS.SLIDESHOW_ORDER, newOrder);

        await updateSlideshowSettings(newTransitionTime, newOrder);
        showSaveConfirmation();

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings. Please check the console for details.');
    }
}

/**
 * Shows save confirmation message
 * Provides feedback for Slideshow Management User Story 1
 */
function showSaveConfirmation() {
    if (!dom.saveMessage) return;
    dom.saveMessage.style.display = 'flex';
    dom.saveMessage.style.opacity = '1';
    setTimeout(() => {
        dom.saveMessage.style.opacity = '0';
        setTimeout(() => {
            dom.saveMessage.style.display = 'none';
        }, UI.FADE_DURATION);
    }, UI.SAVE_MESSAGE_DURATION);
}

/**
 * Displays available tags for selection
 * Implements Slideshow Management User Story 3:
 * - Show all tags
 * - Allow multiple tag selection
 */
function displayTagsForSelection() {
    if (!dom.tagSelectionContainer) {
        console.warn('Tag selection container not found in DOM cache for settings.');
        return;
    }
    dom.tagSelectionContainer.innerHTML = ''; // Clear existing
    const allTags = state.tags || []; // Get tags from global state

    if (allTags.length === 0) {
        dom.tagSelectionContainer.innerHTML = '<p class="bx--type-body-short-01">No tags available.</p>';
        return;
    }

    allTags.forEach(tag => {
        // Using Carbon components structure for checkboxes
        const div = document.createElement('div');
        div.className = 'bx--form-item bx--checkbox-wrapper';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'bx--checkbox';
        input.id = `settings-tag-${tag.id || tag.name.replace(/\s+/g, '-')}`; // Use ID or sanitized name
        input.value = tag.name;
        input.name = 'settingSelectedTags';

        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.className = 'bx--checkbox-label';
        // Add the checkbox icon structure for Carbon
        label.innerHTML = `<span class="bx--checkbox-label-text">${tag.name}</span>`;

        div.appendChild(input);
        div.appendChild(label);
        dom.tagSelectionContainer.appendChild(div);
    });
}

/**
 * Handles play tags button click
 * Implements Slideshow Management User Story 3:
 * - Play selected tags
 * - Validate tag selection
 */
async function handlePlayTagsClick() {
    if (!dom.tagSelectionContainer || !dom.playTagsBtn) return;

    const selectedCheckboxes = dom.tagSelectionContainer.querySelectorAll('input[name="settingSelectedTags"]:checked');
    const selectedTagNames = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedTagNames.length === 0) {
        // Maybe use a Carbon notification instead of alert
        alert('Please select at least one tag to play.');
        return;
    }

    console.log(`Settings: Playing tags: ${selectedTagNames.join(', ')}`);
    dom.playTagsBtn.classList.add('bx--btn--disabled'); // Disable button during API call
    dom.playTagsBtn.setAttribute('disabled', true);
    try {
        await playSelectedTags(selectedTagNames);
        // Optionally provide user feedback (e.g., Carbon notification)
        console.log(`Request sent to play tags: ${selectedTagNames.join(', ')}`);
        // alert(`Starting slideshow with tags: ${selectedTagNames.join(', ')}`);
    } catch (error) {
        console.error('Error starting slideshow with selected tags:', error);
        alert('Failed to start slideshow with selected tags. Check console.'); // Basic feedback
    } finally {
        dom.playTagsBtn.classList.remove('bx--btn--disabled');
        dom.playTagsBtn.removeAttribute('disabled');
    }
}

/**
 * Handles incoming settings update events
 * Used by Slideshow Management User Story 1 for real-time updates
 */
function handleSocketSettingsUpdate(data) {
    console.log('Socket received settingsUpdate:', data);
    if (data && data.transitionTime !== undefined && data.order !== undefined) {
        // Update local state if necessary (localStorage should be updated by the source of the event)
        updateState('slideshow', { // Also update runtime state if used
             transitionTime: data.transitionTime,
             order: data.order
         });
        // Reload the values into the form fields to reflect the change
        loadSettingsValues();
    }
}

/**
 * Attaches event listeners for settings controls
 * Implements Slideshow Management Stories 1-4:
 * - Order buttons
 * - Save button
 * - Play tags button
 * - Settings update handling
 */
export function attachSettingsEventListeners() {
    // Order Buttons
    if (dom.orderRandomBtn) dom.orderRandomBtn.addEventListener('click', handleOrderButtonClick);
    if (dom.orderAlphaBtn) dom.orderAlphaBtn.addEventListener('click', handleOrderButtonClick);
    if (dom.orderGroupsBtn) dom.orderGroupsBtn.addEventListener('click', handleOrderButtonClick);

    // Save Button
    if (dom.saveSettingsBtn) dom.saveSettingsBtn.addEventListener('click', handleSaveSettings);

     // Play Tags Button
    if (dom.playTagsBtn) dom.playTagsBtn.addEventListener('click', handlePlayTagsClick);

    // Playlist play buttons are now handled by playlistManager.js
}

/**
 * Initializes the settings tab
 * Sets up all settings functionality based on user stories
 */
export function initSettingsTab() {
    console.log('Initializing Settings Tab...');

    loadSettingsValues();
    displayTagsForSelection(); // Populate tags checkbox list
    // displayPlaylistsForSelection is now handled by playlistManager.js
    attachSettingsEventListeners();

    // Add Socket Listener for remote changes
    if (socket) {
        socket.off('settingsUpdate', handleSocketSettingsUpdate); // Remove previous listener if re-initializing
        socket.on('settingsUpdate', handleSocketSettingsUpdate);
        console.log('Settings tab listening for "settingsUpdate" socket events.');
    } else {
        console.warn('Socket not available for settings tab.');
    }
} 