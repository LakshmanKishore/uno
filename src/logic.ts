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
  // This helps us track which cards to draw if there is a stack
  // for example, if player 1 plays +2, then player 2 plays +2, the next player will draw 4 cards.
  // This variable will be 4 in this case.
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
  // We don't consider +4 here as it's a wild card and will be handled by the first condition.
  // We must allow the user to play a +2 or +4 even if the color doesn't match
  // this is how it works in the official uno rules.
  // We must also allow the user to play a +2 or +4 even if the value doesn't match
  // since the only criteria is to play a similar "draw card".
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

// --- Logic ---

Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 4,
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
        else {
          throw Rune.invalidAction() // Removed argument
        }
      }
    }

    // Start discard pile with a non-Wild Draw Four card
    let startCard: Card
    do {
      if (deck.length === 0) {
        deck = shuffle(createDeck())
        players.forEach((p) =>
          p.hand.forEach((c) => {
            deck = deck.filter((deckCard) => deckCard.id !== c.id)
          })
        )
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

    if (startCard.value === "skip") {
      currentPlayerIndex = getNextPlayerIndex(
        currentPlayerIndex,
        direction,
        allPlayerIds.length
      )
    } else if (startCard.value === "reverse") {
      if (allPlayerIds.length === 2) {
        currentPlayerIndex = getNextPlayerIndex(
          currentPlayerIndex,
          direction,
          allPlayerIds.length
        )
      } else {
        direction = (direction * -1) as 1 | -1 // Explicitly cast after multiplication
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
        allPlayerIds.length
      )
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
    }
  },
  actions: {
    playCard: ({ cardId, selectedColor }, { game, playerId }) => {
      const playerIndex = game.players.findIndex((p) => p.id === playerId)
      const player = game.players[playerIndex]

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction() // Removed argument

      const cardIndex = player.hand.findIndex((c) => c.id === cardId)
      let card: Card | undefined = player.hand[cardIndex]
      let playingDrawn = false

      if (!card && game.drawnCard && game.drawnCard.id === cardId) {
        card = game.drawnCard
        playingDrawn = true
      }

      if (!card) throw Rune.invalidAction() // Removed argument

      const topCard = game.discardPile[game.discardPile.length - 1]
      const canPlayDrawCard =
        game.drawStack > 0 &&
        (card.value === "drawTwo" || card.value === "wildDrawFour")
      if (
        !isValidMove(card, topCard, game.currentColor, game.drawStack > 0) &&
        !canPlayDrawCard
      ) {
        throw Rune.invalidAction() // Removed argument
      }

      if (
        (card.value === "wild" || card.value === "wildDrawFour") &&
        !selectedColor
      ) {
        throw Rune.invalidAction() // Removed argument
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
        for (let i = 0; i < 2; i++) {
          const c = game.deck.pop()
          if (c) player.hand.push(c)
          else if (game.discardPile.length > 1) {
            const currentTopCard = game.discardPile.pop()!
            game.deck = shuffle(game.discardPile)
            game.discardPile = [currentTopCard]
            const reshuffledCard = game.deck.pop()
            if (reshuffledCard) player.hand.push(reshuffledCard)
            else throw Rune.invalidAction() // Removed argument
          } else {
            throw Rune.invalidAction() // Removed argument
          }
        }
      }

      if (player.hand.length > 1) player.hasCalledUno = false

      let nextPlayerSkip = false

      if (card.value === "reverse") {
        if (game.players.length === 2) {
          nextPlayerSkip = true
        } else {
          game.direction = (game.direction * -1) as 1 | -1 // Explicitly cast
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
          for (let i = 0; i < game.drawStack; i++) {
            const c = game.deck.pop()
            if (c) currentPlayer.hand.push(c)
            else if (game.discardPile.length > 1) {
              const currentTopCard = game.discardPile.pop()!
              game.deck = shuffle(game.discardPile)
              game.discardPile = [currentTopCard]
              const reshuffledCard = game.deck.pop()
              if (reshuffledCard) currentPlayer.hand.push(reshuffledCard)
              else throw Rune.invalidAction() // Removed argument
            } else {
              throw Rune.invalidAction() // Removed argument
            }
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

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction() // Removed argument
      if (game.drawStack > 0) {
        game.lastAction += ` (${player.id} draws ${game.drawStack} cards)`
        for (let i = 0; i < game.drawStack; i++) {
          const c = game.deck.pop()
          if (c) player.hand.push(c)
          else if (game.discardPile.length > 1) {
            const currentTopCard = game.discardPile.pop()!
            game.deck = shuffle(game.discardPile)
            game.discardPile = [currentTopCard]
            const reshuffledCard = game.deck.pop()
            if (reshuffledCard) player.hand.push(reshuffledCard)
            else throw Rune.invalidAction() // Removed argument
          } else {
            throw Rune.invalidAction() // Removed argument
          }
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

      if (game.drawnCard) throw Rune.invalidAction() // Removed argument

      if (game.deck.length === 0) {
        const currentTopCard = game.discardPile.pop()!
        game.deck = shuffle(game.discardPile)
        game.discardPile = [currentTopCard]
        game.deck.forEach((c) => {
          if (c.value === "wild" || c.value === "wildDrawFour") c.color = null
        })
      }

      const newCard = game.deck.pop()
      if (!newCard) throw Rune.invalidAction() // Removed argument

      game.drawnCard = newCard
      game.lastAction = `${player.id} drew a card.`
      player.hasCalledUno = false
    },

    passTurn: (_, { game, playerId }) => {
      const playerIndex = game.players.findIndex((p) => p.id === playerId)
      const player = game.players[playerIndex]

      if (game.currentPlayerIndex !== playerIndex) throw Rune.invalidAction() // Removed argument
      if (!game.drawnCard) throw Rune.invalidAction() // Removed argument
      if (game.drawStack > 0) throw Rune.invalidAction() // Removed argument

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
      if (!player) throw Rune.invalidAction() // Removed argument

      if (
        game.currentPlayerIndex ===
        game.players.findIndex((p) => p.id === playerId)
      ) {
        if (player.hand.length > 2) throw Rune.invalidAction() // Removed argument

        player.hasCalledUno = true
        game.lastAction = `${player.id} called UNO!`
      } else {
        throw Rune.invalidAction() // Removed argument
      }
    },
  },
})
