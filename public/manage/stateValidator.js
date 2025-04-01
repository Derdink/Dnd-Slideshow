// public/manage/stateValidator.js
// State validation and consistency checks

import { ErrorTypes } from './errorHandler.js';
import { DEFAULTS } from '../config.js';

/**
 * Validates state structure and values
 * Implements Slideshow Management User Story 2:
 * - Validate slideshow source type
 * - Ensure proper state transitions
 */
export function validateState(state) {
    const errors = [];

    // Validate management state
    if (state.management) {
        const { currentPage, currentLimit, sortKey, sortDirection } = state.management;
        
        if (currentPage < 1) errors.push('Current page must be positive');
        if (currentLimit < 1) errors.push('Items per page must be positive');
        
        // Only validate sortKey and sortDirection if they are provided
        if (sortKey !== undefined && sortKey !== null && !['title', 'dateAdded', 'name'].includes(sortKey)) {
            errors.push('Invalid sort key');
        }
        if (sortDirection !== undefined && sortDirection !== null && !['asc', 'desc'].includes(sortDirection)) {
            errors.push('Invalid sort direction');
        }
    }

    // Validate slideshow state
    if (state.slideshow) {
        const { transitionTime, order, source, tagGroups, currentTagIndex, currentImageInTagIndex } = state.slideshow;
        
        if (transitionTime < 1) errors.push('Transition time must be positive');
        if (!['random', 'alphabetical', 'groups'].includes(order)) {
            errors.push('Invalid slideshow order');
        }
        if (!['selected', 'playlist', 'tags', 'all'].includes(source)) {
            errors.push('Invalid slideshow source');
        }
        if (order === 'groups') {
            if (tagGroups !== null && !(tagGroups instanceof Map)) {
                errors.push('Invalid tag groups structure');
            }
            if (typeof currentTagIndex !== 'number' || currentTagIndex < 0) {
                errors.push('Invalid current tag index');
            }
            if (typeof currentImageInTagIndex !== 'number' || currentImageInTagIndex < 0) {
                errors.push('Invalid current image in tag index');
            }
        }
    }

    return errors;
}

/**
 * Validates playlist data
 */
export function validatePlaylist(playlist) {
    const errors = [];

    if (!playlist.name || playlist.name.trim() === '') {
        errors.push('Playlist name cannot be empty');
    }
    if (playlist.name.length > 100) {
        errors.push('Playlist name too long');
    }
    if (!Array.isArray(playlist.imageIds)) {
        errors.push('Playlist must have an imageIds array');
    }

    return errors;
}

/**
 * Validates tag data
 */
export function validateTag(tag) {
    const errors = [];

    if (!tag.name || tag.name.trim() === '') {
        errors.push('Tag name cannot be empty');
    }
    if (tag.name.length > 50) {
        errors.push('Tag name too long');
    }
    if (!tag.color || !tag.color.match(/^#[0-9A-Fa-f]{6}$/)) {
        errors.push('Invalid tag color');
    }

    return errors;
}

/**
 * Validates image data
 */
export function validateImage(image) {
    const errors = [];

    if (!image.title || image.title.trim() === '') {
        errors.push('Image title cannot be empty');
    }
    if (image.title.length > 200) {
        errors.push('Image title too long');
    }
    if (image.description && image.description.length > 1000) {
        errors.push('Image description too long');
    }
    if (!Array.isArray(image.tagIds)) {
        errors.push('Image must have a tagIds array');
    }

    return errors;
}

/**
 * Sanitizes state values to ensure consistency
 */
export function sanitizeState(state) {
    const sanitized = { ...state };

    // Sanitize management state
    if (sanitized.management) {
        sanitized.management.currentPage = Math.max(1, Math.floor(sanitized.management.currentPage));
        sanitized.management.currentLimit = Math.max(1, Math.floor(sanitized.management.currentLimit));
        
        // Ensure sortKey has a valid value or default to 'title'
        sanitized.management.sortKey = (sanitized.management.sortKey !== undefined && 
                                      sanitized.management.sortKey !== null &&
                                      ['title', 'dateAdded', 'name'].includes(sanitized.management.sortKey))
            ? sanitized.management.sortKey 
            : 'title';
            
        // Ensure sortDirection has a valid value or default to 'asc'
        sanitized.management.sortDirection = (sanitized.management.sortDirection !== undefined && 
                                           sanitized.management.sortDirection !== null &&
                                           ['asc', 'desc'].includes(sanitized.management.sortDirection))
            ? sanitized.management.sortDirection
            : 'asc';
    }

    // Sanitize slideshow state
    if (sanitized.slideshow) {
        sanitized.slideshow.transitionTime = Math.max(1, Math.floor(sanitized.slideshow.transitionTime));
        sanitized.slideshow.order = ['random', 'alphabetical', 'groups'].includes(sanitized.slideshow.order)
            ? sanitized.slideshow.order
            : DEFAULTS.SLIDESHOW_ORDER;
        
        // Reset tag-based ordering fields if order is not 'groups'
        if (sanitized.slideshow.order !== 'groups') {
            sanitized.slideshow.tagGroups = null;
            sanitized.slideshow.currentTagIndex = 0;
            sanitized.slideshow.currentImageInTagIndex = 0;
        }
    }

    return sanitized;
}

/**
 * Validates and sanitizes state updates
 */
export function validateAndSanitizeStateUpdate(currentState, update) {
    const errors = validateState(update);
    if (errors.length > 0) {
        throw new Error(`Invalid state update: ${errors.join(', ')}`);
    }
    return sanitizeState(update);
} 