// public/manage/errorHandler.js
// Centralized error handling and user feedback

import { UI } from '../config.js';

/**
 * Error types for consistent error handling
 */
export const ErrorTypes = {
    NETWORK: 'NETWORK',
    VALIDATION: 'VALIDATION',
    PERMISSION: 'PERMISSION',
    NOT_FOUND: 'NOT_FOUND',
    SERVER: 'SERVER',
    UNKNOWN: 'UNKNOWN'
};

/**
 * Creates a user-friendly error message based on error type and details
 */
export function createErrorMessage(error, type = ErrorTypes.UNKNOWN) {
    const baseMessages = {
        [ErrorTypes.NETWORK]: 'Network error occurred. Please check your connection.',
        [ErrorTypes.VALIDATION]: 'Invalid input. Please check your values.',
        [ErrorTypes.PERMISSION]: 'You do not have permission to perform this action.',
        [ErrorTypes.NOT_FOUND]: 'The requested item was not found.',
        [ErrorTypes.SERVER]: 'Server error occurred. Please try again later.',
        [ErrorTypes.UNKNOWN]: 'An unexpected error occurred. Please try again.'
    };

    let message = baseMessages[type];
    
    // Add specific error details if available
    if (error.message && error.message !== '') {
        message += ` Details: ${error.message}`;
    }

    return message;
}

/**
 * Shows a toast notification for errors
 */
export function showErrorToast(message, duration = UI.SAVE_MESSAGE_DURATION) {
    const toast = document.createElement('div');
    toast.className = 'bx--toast-notification bx--toast-notification--error';
    toast.innerHTML = `
        <div class="bx--toast-notification__content">
            <div class="bx--toast-notification__details">
                <p class="bx--toast-notification__title">Error</p>
                <p class="bx--toast-notification__subtitle">${message}</p>
            </div>
        </div>
        <button class="bx--toast-notification__close-button" type="button">
            <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
            </svg>
        </button>
    `;

    // Add to document
    document.body.appendChild(toast);

    // Add close button handler
    const closeBtn = toast.querySelector('.bx--toast-notification__close-button');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), UI.FADE_DURATION);
        });
    }

    // Auto-remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), UI.FADE_DURATION);
    }, duration);
}

/**
 * Handles an error by showing appropriate feedback and logging
 */
export function handleError(error, type = ErrorTypes.UNKNOWN) {
    console.error(`[ErrorHandler] ${type} error:`, error);
    const message = createErrorMessage(error, type);
    showErrorToast(message);
    return message;
}

/**
 * Wraps an async function with error handling
 */
export function withErrorHandling(fn, type = ErrorTypes.UNKNOWN) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(error, type);
            throw error; // Re-throw to allow caller to handle if needed
        }
    };
} 