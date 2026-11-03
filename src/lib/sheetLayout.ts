/**
 * Layout for a bottom sheet inside a modal that may or may not include the
 * home-indicator and status-bar areas.
 *
 * A full-screen frame needs one bottom inset inside the sheet, and the dim
 * already covers the screen. A short frame (the modal view stops above the
 * home indicator) has to paint the dim past that edge and pull the sheet
 * background down with it, or the inset is applied twice and a strip of the
 * screen stays undimmed.
 */

export type SheetFrame = {
  screenHeight: number;
  /** Laid-out height of the modal root. */
  frameHeight: number;
  topInset: number;
  bottomInset: number;
  leftInset: number;
  rightInset: number;
  keyboardHeight: number;
  wide: boolean;
  /** Padding under the content when the home indicator is not the gap. */
  contentGap: number;
};

export type SheetChrome = {
  bleedTop: number;
  bleedBottom: number;
  bleedLeft: number;
  bleedRight: number;
  /** How far to pull the sheet down so its fill covers the home indicator. */
  drop: number;
  /** Padding applied under the sheet, in the modal's coordinate space. */
  keyboardLift: number;
  /** Padding inside the sheet, below its content. */
  contentBottom: number;
  /** Cap for scrolling sheet content. */
  maxBodyHeight: number;
};

export function sheetChrome(input: SheetFrame): SheetChrome {
  const coversScreen = input.frameHeight >= input.screenHeight - 1;
  const keyboardOpen = input.keyboardHeight > 0;
  // Always extend the dim by the safe area. On a frame that is already the
  // physical screen this is clipped. On a short frame it covers the gap.
  const bleedTop = input.topInset;
  const bleedBottom = input.bottomInset;
  const bleedLeft = input.leftInset;
  const bleedRight = input.rightInset;
  // Only pull the sheet into a gap the frame does not already include.
  // The keyboard covers the home indicator, so that pull would double-count.
  const drop = input.wide || keyboardOpen || coversScreen ? 0 : input.bottomInset;
  // Keyboard height is measured from the physical bottom. A short frame
  // already ends above the home indicator, which the keyboard occupies.
  const keyboardOutside = coversScreen || input.wide ? 0 : input.bottomInset;
  const keyboardLift = keyboardOpen ? Math.max(0, input.keyboardHeight - keyboardOutside) : 0;
  const contentBottom =
    input.wide || keyboardOpen ? input.contentGap : Math.max(input.bottomInset, input.contentGap);
  const topChrome = input.wide ? 48 : input.topInset + 12;
  const maxBodyHeight = Math.max(
    120,
    input.screenHeight - input.keyboardHeight - topChrome - contentBottom,
  );
  return {
    bleedTop,
    bleedBottom,
    bleedLeft,
    bleedRight,
    drop,
    keyboardLift,
    contentBottom,
    maxBodyHeight,
  };
}
