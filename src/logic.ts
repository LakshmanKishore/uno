import type { PlayerId, RuneClient } from "rune-sdk"

export type Color = "red" | "blue" | "green" | "yellow" | null // null for pure wild in hand
export type Value =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "skip"
  | "reverse"
  | "drawTwo"
  | "wild"
  | "wildDrawFour"

export interface Card {
  color: Color
  value: Value
  id: string
}

export interface PlayerState {
  id: PlayerId
  hand: Card[]
  hasCalledUno: boolean
}

export interface GameState {
  deck: Card[]
  discardPile: Card[]
  players: PlayerState[]
  currentPlayerIndex: number
  direction: 1 | -1 // 1 for clockwise, -1 for counter-clockwise
  currentColor: Exclude<Color, null> // The effective color of the discard pile (handles wilds)
  winner: PlayerId | null
  drawnCard: Card | null // If the player just drew a card, store it here
  lastAction: string | null
  drawStack: number // For stacking Draw Two and Draw Four
  playerCache: Record<string, Card[]> // Cache for players who left
}

export type GameActions = {
  playCard: (params: {
    cardId: string
    selectedColor?: Exclude<Color, null>
  }) => void
  drawCard: () => void
  passTurn: () => void
  callUno: () => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

// --- Helpers ---

function createDeck(): Card[] {
  const colors: Exclude<Color, null>[] = ["red", "blue", "green", "yellow"]
  const deck: Card[] = []
  let idCounter = 0

  colors.forEach((color) => {
    // 1 zero
    deck.push({ color, value: "0", id: `c-${idCounter++}` })
    // 2 of each 1-9
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: i.toString() as Value, id: `c-${idCounter++}` })
      deck.push({ color, value: i.toString() as Value, id: `c-${idCounter++}` })
    }
    // 2 of each action
    ;["skip", "reverse", "drawTwo"].forEach((val) => {
      deck.push({ color, value: val as Value, id: `c-${idCounter++}` })
      deck.push({ color, value: val as Value, id: `c-${idCounter++}` })
    })
  })

  // 4 Wild, 4 Wild Draw Four
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, value: "wild", id: `c-${idCounter++}` })
    deck.push({ color: null, value: "wildDrawFour", id: `c-${idCounter++}` })
  }

  return deck
}

function shuffle(deck: Card[]): Card[] {
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function getNextPlayerIndex(
  current: number,
  direction: 1 | -1,
  numPlayers: number
): number {
  if (numPlayers === 0) return 0
  return (current + direction + numPlayers) % numPlayers
}

function isValidMove(
  card: Card,
  topCard: Card,
  currentColor: Exclude<Color, null>,
  isDrawingPhase: boolean
): boolean {
  // Always allow wilds to be played
  if (card.color === null) return true

  // If there's a draw stack, only +2 or +4 cards can be played
  if (
    isDrawingPhase &&
    (topCard.value === "drawTwo" || topCard.value === "wildDrawFour")
  ) {
    return card.value === "drawTwo" || card.value === "wildDrawFour"
  }

  // Card matches current color
  if (card.color === currentColor) return true

  // Card matches value of the top card (for non-wild cards)
  if (card.value === topCard.value) return true

  return false
}

// Helper to handle deck refill
function ensureDeck(game: GameState) {
  if (game.deck.length === 0) {
    if (game.discardPile.length > 1) {
      const currentTopCard = game.discardPile.pop()!
      game.deck = shuffle(game.discardPile)
      game.discardPile = [currentTopCard]
      game.deck.forEach((c) => {
        if (c.value === "wild" || c.value === "wildDrawFour") c.color = null
      })
    }
  }
}

// --- Logic ---

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 6,
  setup: (allPlayerIds) => {
    let deck = shuffle(createDeck())
    const players: PlayerState[] = allPlayerIds.map((id) => ({
      id,
      hand: [],
      hasCalledUno: false,
    }))

    // Deal 7 cards
    for (const player of players) {
      for (let i = 0; i < 7; i++) {
        const card = deck.pop()
        if (card) player.hand.push(card)
      }
    }

    // Start discard pile
    let startCard: Card
    do {
      if (deck.length === 0) {
        deck = shuffle(createDeck())
      }
      startCard = deck.pop()!
      if (startCard.value === "wildDrawFour") {
        deck.unshift(startCard)
        deck = shuffle(deck)
      }
    } while (startCard.value === "wildDrawFour")

    let initialCurrentColor: Exclude<Color, null> = "red"
    if (startCard.color !== null) {
      initialCurrentColor = startCard.color
    } else if (startCard.value === "wild") {
      initialCurrentColor = "red"
    }

    let currentPlayerIndex = 0
    let direction: 1 | -1 = 1
    let drawStack = 0

    // Handle initial card effects
    if (players.length > 0) {
      if (startCard.value === "skip") {
        currentPlayerIndex = getNextPlayerIndex(
          currentPlayerIndex,
          direction,
          players.length
        )
      } else if (startCard.value === "reverse") {
        if (players.length === 2) {
          currentPlayerIndex = getNextPlayerIndex(
            currentPlayerIndex,
            direction,
            players.length
          )
        } else {
          direction = (direction * -1) as 1 | -1
        }
      } else if (startCard.value === "drawTwo") {
        drawStack = 2
        const firstPlayer = players[currentPlayerIndex]
        for (let i = 0; i < 2; i++) {
          const card = deck.pop()
          if (card) firstPlayer.hand.push(card)
        }
        currentPlayerIndex = getNextPlayerIndex(
          currentPlayerIndex,
          direction,
          players.length
        )
      }
    }

    return {
      deck,
      discardPile: [startCard],
      players,
      currentPlayerIndex,
      direction,
      currentColor: initialCurrentColor,
      winner: null,
      drawnCard: null,
      lastAction: "Game Started",
      drawStack,
      playerCache: {},
    }
  },
  actions: {
    playCard: ({ cardId, selectedColor }, { game, playerId }) => {
      const playerIndex = game.players.findIndex((p) => p.id === playerId)
      const player = game.players[playerIndex]

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction()

      const cardIndex = player.hand.findIndex((c) => c.id === cardId)
      let card: Card | undefined = player.hand[cardIndex]
      let playingDrawn = false

      if (!card && game.drawnCard && game.drawnCard.id === cardId) {
        card = game.drawnCard
        playingDrawn = true
      }

      if (!card) throw Rune.invalidAction()

      const topCard = game.discardPile[game.discardPile.length - 1]
      const canPlayDrawCard =
        game.drawStack > 0 &&
        (card.value === "drawTwo" || card.value === "wildDrawFour")
      if (
        !isValidMove(card, topCard, game.currentColor, game.drawStack > 0) &&
        !canPlayDrawCard
      ) {
        throw Rune.invalidAction()
      }

      if (
        (card.value === "wild" || card.value === "wildDrawFour") &&
        !selectedColor
      ) {
        throw Rune.invalidAction()
      }

      if (playingDrawn) {
        game.drawnCard = null
      } else {
        player.hand.splice(cardIndex, 1)
      }

      game.discardPile.push(card)
      game.currentColor = card.color === null ? selectedColor! : card.color
      game.lastAction = `${player.id} played ${card.value === "wild" || card.value === "wildDrawFour" ? `Wild (${game.currentColor})` : card.value} ${card.color || ""}`

      if (player.hand.length === 0) {
        game.winner = playerId
        Rune.gameOver({ players: { [playerId]: "WON" } })
        return
      }

      if (player.hand.length === 1 && !player.hasCalledUno) {
        game.lastAction += ` (Forgot UNO! ${player.id} draws 2)`
        ensureDeck(game)
        for (let i = 0; i < 2; i++) {
          ensureDeck(game)
          const c = game.deck.pop()
          if (c) player.hand.push(c)
        }
      }

      if (player.hand.length > 1) player.hasCalledUno = false

      let nextPlayerSkip = false

      if (card.value === "reverse") {
        if (game.players.length === 2) {
          nextPlayerSkip = true
        } else {
          game.direction = (game.direction * -1) as 1 | -1
        }
      } else if (card.value === "skip") {
        nextPlayerSkip = true
      } else if (card.value === "drawTwo") {
        game.drawStack += 2
      } else if (card.value === "wildDrawFour") {
        game.drawStack += 4
      }

      game.currentPlayerIndex = getNextPlayerIndex(
        game.currentPlayerIndex,
        game.direction,
        game.players.length
      )
      if (nextPlayerSkip) {
        game.currentPlayerIndex = getNextPlayerIndex(
          game.currentPlayerIndex,
          game.direction,
          game.players.length
        )
        game.lastAction += ` (Skipped next player)`
      }

      if (game.drawStack > 0) {
        const currentPlayer = game.players[game.currentPlayerIndex]
        const canStackDraw = currentPlayer.hand.some(
          (c) => c.value === "drawTwo" || c.value === "wildDrawFour"
        )

        if (!canStackDraw) {
          game.lastAction += ` (${currentPlayer.id} draws ${game.drawStack} cards)`
          ensureDeck(game)
          for (let i = 0; i < game.drawStack; i++) {
            ensureDeck(game)
            const c = game.deck.pop()
            if (c) currentPlayer.hand.push(c)
          }
          game.drawStack = 0
          game.currentPlayerIndex = getNextPlayerIndex(
            game.currentPlayerIndex,
            game.direction,
            game.players.length
          )
        }
      }

      game.drawnCard = null
    },

    drawCard: (_, { game, playerId }) => {
      const playerIndex = game.players.findIndex((p) => p.id === playerId)
      const player = game.players[playerIndex]

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction()
      if (game.drawStack > 0) {
        game.lastAction += ` (${player.id} draws ${game.drawStack} cards)`
        ensureDeck(game)
        for (let i = 0; i < game.drawStack; i++) {
          ensureDeck(game)
          const c = game.deck.pop()
          if (c) player.hand.push(c)
        }
        game.drawStack = 0
        player.hasCalledUno = false
        game.currentPlayerIndex = getNextPlayerIndex(
          game.currentPlayerIndex,
          game.direction,
          game.players.length
        )
        return
      }

      if (game.drawnCard) throw Rune.invalidAction()

      ensureDeck(game)
      const newCard = game.deck.pop()
      if (!newCard) throw Rune.invalidAction()

      game.drawnCard = newCard
      game.lastAction = `${player.id} drew a card.`
      player.hasCalledUno = false
    },

    passTurn: (_, { game, playerId }) => {
      const playerIndex = game.players.findIndex((p) => p.id === playerId)
      const player = game.players[playerIndex]

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction()
      if (!game.drawnCard) throw Rune.invalidAction()
      if (game.drawStack > 0) throw Rune.invalidAction()

      player.hand.push(game.drawnCard)
      player.hasCalledUno = false

      game.drawnCard = null
      game.lastAction = `${player.id} passed their turn.`
      game.currentPlayerIndex = getNextPlayerIndex(
        game.currentPlayerIndex,
        game.direction,
        game.players.length
      )
    },

    callUno: (_, { game, playerId }) => {
      const player = game.players.find((p) => p.id === playerId)
      if (!player) throw Rune.invalidAction()

      if (
        game.currentPlayerIndex ===
        game.players.findIndex((p) => p.id === playerId)
      ) {
        if (player.hand.length > 2) throw Rune.invalidAction()

        player.hasCalledUno = true
        game.lastAction = `${player.id} called UNO!`
      } else {
        throw Rune.invalidAction()
      }
    },
  },
  events: {
    playerJoined: (playerId, { game }) => {
      // Don't add if already exists
      if (game.players.some((p) => p.id === playerId)) return

      let hand: Card[] = []

      // Restore from cache if available
      if (game.playerCache[playerId]) {
        hand = game.playerCache[playerId]
        delete game.playerCache[playerId]
      } else {
        // Deal new hand
        ensureDeck(game)
        for (let i = 0; i < 7; i++) {
          ensureDeck(game)
          const c = game.deck.pop()
          if (c) hand.push(c)
        }
      }

      game.players.push({
        id: playerId,
        hand,
        hasCalledUno: false,
      })

      game.lastAction = `${playerId} joined.`
    },
    playerLeft: (playerId, { game }) => {
      const idx = game.players.findIndex((p) => p.id === playerId)
      if (idx !== -1) {
        const player = game.players[idx]

        // Cache hand
        game.playerCache[playerId] = player.hand

        // If it was the current player's turn, we need to handle state
        const wasCurrentPlayer = idx === game.currentPlayerIndex

        // Remove player
        game.players.splice(idx, 1)

        // Fix index
        if (game.players.length === 0) {
          game.currentPlayerIndex = 0
        } else {
          if (idx < game.currentPlayerIndex) {
            game.currentPlayerIndex--
          }
          game.currentPlayerIndex %= game.players.length
        }

        if (wasCurrentPlayer) {
          // Reset turn-specific state
          game.drawnCard = null
          // Note: game.drawStack persists to the next player
        }

        game.lastAction = `${playerId} left.`
      }
    },
  },
})
