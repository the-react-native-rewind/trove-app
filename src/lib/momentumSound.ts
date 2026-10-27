import { preload, setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import momentumDingSource from '../../assets/sounds/momentum-ding.wav';
import { momentumPlaybackRate } from '@/lib/today';

/**
 * Original public-domain chime (see assets/sounds/LICENCE.txt).
 * Preloaded when Today loads so the first tick does not wait on the file.
 * The session respects the silent switch and mixes with other audio.
 * Nothing is played until a tick gesture calls playMomentumDing.
 */
try {
  void preload(momentumDingSource).catch(() => {
    // The player still loads the bundled file.
  });
} catch {
  // Asset resolution can fail before the runtime is ready.
}

let modeApplied = false;
let modePromise: Promise<void> | null = null;

function ensureChimeMode(): Promise<void> {
  if (modeApplied) return Promise.resolve();
  if (!modePromise) {
    modePromise = setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    })
      .then(() => {
        modeApplied = true;
      })
      .catch(() => {
        modePromise = null;
      });
  }
  return modePromise;
}

void ensureChimeMode();

/**
 * Pitch follows the rate. Correction would keep the original note and only
 * change speed, so it stays off. Web also clears preservesPitch.
 */
function applyMomentumRate(player: AudioPlayer, rate: number) {
  player.shouldCorrectPitch = false;
  if (Platform.OS === 'web') {
    player.setPlaybackRate(rate);
    return;
  }
  player.playbackRate = rate;
}

export function playMomentumDing(player: AudioPlayer, rate = 1): void {
  try {
    player.loop = false;
    applyMomentumRate(player, rate);
    if (Platform.OS === 'web') {
      // seekTo sets currentTime before it yields, so play() stays in the gesture turn.
      void player.seekTo(0);
      player.play();
      return;
    }
    void ensureChimeMode()
      .then(() => player.seekTo(0, 0, 0))
      .then(() => {
        player.play();
      })
      .catch(() => {
        // The device has no audio route for this tick.
      });
  } catch {
    // Unavailable here, or the browser is still waiting for a gesture.
  }
}

/**
 * A player that stays loaded for the screen and does not take the audio session down when the chime ends.
 * `play` sounds the ding at the pitch for that ticked count. `setStep` moves the pitch without playing,
 * which is how an untick steps back down.
 */
export function useMomentumChime(): { play: (count: number) => void; setStep: (count: number) => void } {
  const player = useAudioPlayer(momentumDingSource, {
    keepAudioSessionActive: true,
    updateInterval: 1000,
  });
  const play = useCallback(
    (count: number) => playMomentumDing(player, momentumPlaybackRate(count)),
    [player],
  );
  const setStep = useCallback(
    (count: number) => {
      try {
        applyMomentumRate(player, momentumPlaybackRate(count));
      } catch {
        // The player is not ready. The next tick applies the rate again.
      }
    },
    [player],
  );
  return { play, setStep };
}
