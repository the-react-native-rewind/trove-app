/**
 * How many circle invites one person may create in a rolling day.
 * Each new pending invite emails the address (trigger invites_send_email).
 * The database enforces the same cap in migration 0024. send-email keeps a
 * backstop that skips the email if a row still lands over the cap.
 */
export const INVITE_LIMIT_PER_DAY = 25;
export const INVITE_LIMIT_WINDOW_HOURS = 24;
