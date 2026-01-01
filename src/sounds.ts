import cardPlay from "./assets/card_play.mp3"
import changeColor from "./assets/change_color.mp3"
import drawCard from "./assets/draw_card.mp3"
import fourAndWild from "./assets/four_and_wild.mp3"
import reverse from "./assets/reverse.mp3"
import shield from "./assets/shield.mp3"
import skip from "./assets/skip.mp3"
import win from "./assets/win.mp3"

type SoundName =
  | "cardPlay"
  | "changeColor"
  | "drawCard"
  | "fourAndWild"
  | "reverse"
  | "shield"
  | "skip"
  | "win"

class SoundManager {
  private sounds: Record<SoundName, HTMLAudioElement>

  constructor() {
    this.sounds = {
      cardPlay: new Audio(cardPlay),
      changeColor: new Audio(changeColor),
      drawCard: new Audio(drawCard),
      fourAndWild: new Audio(fourAndWild),
      reverse: new Audio(reverse),
      shield: new Audio(shield),
      skip: new Audio(skip),
      win: new Audio(win),
    }

    // Preload sounds
    Object.values(this.sounds).forEach((audio) => {
      audio.load()
      audio.volume = 0.5 // Default volume
    })
  }

  play(name: SoundName) {
    const audio = this.sounds[name]
    if (audio) {
      audio.currentTime = 0
      audio.play().catch((e) => console.error("Error playing sound:", e))
    }
  }
}

export const sounds = new SoundManager()
