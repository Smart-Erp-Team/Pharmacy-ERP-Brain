/**
 * Pharmacy ERP — Session End Events
 *
 * The Axios client lives outside React, so it cannot reset the auth store, clear
 * the cached server data or navigate by itself. It announces "the session ended"
 * here, and the application shell (`App.tsx`) reacts to that announcement:
 * reset the session, show the message and go back to the login page.
 *
 * This module is the only bridge between the transport layer and the UI, so no
 * file has to import another one just to end a session.
 */

import type { CurrentUser } from '../../types/api';

/** Why the session ended. */
export type SessionEndReason = 'expired' | 'logout';

export type SessionEndHandler = (reason: SessionEndReason) => void;
export type SessionUserUpdatedHandler = (user: CurrentUser) => void;

let sessionEndHandler: SessionEndHandler | null = null;
let sessionUserUpdatedHandler: SessionUserUpdatedHandler | null = null;

/**
 * Registers the single handler that reacts to a session end.
 * Pass `null` to unregister (used when the app unmounts).
 */
export const registerSessionEndHandler = (
  handler: SessionEndHandler | null
): void => {
  sessionEndHandler = handler;
};

/**
 * Announces that the session ended. Does nothing when no handler is registered.
 */
export const notifySessionEnd = (reason: SessionEndReason): void => {
  sessionEndHandler?.(reason);
};

/**
 * Registers the single handler that syncs refreshed user context (`LoginResponse.user`)
 * back into the auth store after silent token rotation.
 * Pass `null` to unregister (used when the app unmounts).
 */
export const registerSessionUserUpdatedHandler = (
  handler: SessionUserUpdatedHandler | null
): void => {
  sessionUserUpdatedHandler = handler;
};

/**
 * Announces updated user identity/scope context from `/auth/refresh`.
 */
export const notifySessionUserUpdated = (user: CurrentUser): void => {
  sessionUserUpdatedHandler?.(user);
};
