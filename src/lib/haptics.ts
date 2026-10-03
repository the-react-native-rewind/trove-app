import * as Haptics from 'expo-haptics';

/**
 * Shared touch feedback. Calls are safe to fire from any press: simulators,
 * desktop browsers, and Low Power Mode often have no haptics engine, and a
 * failure must not block the action.
 */
function fire(run: () => Promise<unknown>) {
  try {
    void Promise.resolve(run()).catch(() => {});
  } catch {
    // Unavailable on this device.
  }
}

/** Primary buttons, tabs, toggles, chips, and segment taps. */
export function hapticLight() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Creating a task. Firmer than a tap, quieter than finishing one. */
export function hapticMedium() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A control whose value changes while it moves, such as a date spinner. */
export function hapticSelection() {
  fire(() => Haptics.selectionAsync());
}

/** A task was marked done. */
export function hapticSuccess() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
