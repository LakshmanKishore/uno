import "./styles.css"
import { Card, Color } from "./logic.ts"
import { PlayerId } from "rune-sdk"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const gameBoard = document.getElementById("gameBoard")!
const playersSection = document.getElementById("playersSection")!
const discardPileElement = document.getElementById("discardPile")!
const drawPileElement = document.getElementById("drawPile")!
const yourHandElement = document.getElementById("yourHand")!
const actionButtonsElement = document.getElementById("actionButtons")!
const wildColorPickerElement = document.getElementById("wildColorPicker")!
const unoButtonElement = document.getElementById("onuButton")!
const lastActionElement = document.getElementById("lastAction")!

// Wrap ONU button
const unoContainer = document.createElement("div")
unoContainer.className = "onu-button-container"
unoButtonElement.parentNode?.insertBefore(unoContainer, unoButtonElement)
unoContainer.appendChild(unoButtonElement)

const unoHint = document.createElement("div")
unoHint.className = "onu-hint"
unoHint.textContent = "Click BEFORE playing!"
unoContainer.insertBefore(unoHint, unoButtonElement)

// Help Button Logic
const helpButton = document.createElement("button")
helpButton.id = "helpButton"
helpButton.textContent = "?"
document.body.appendChild(helpButton)

const rulesModal = document.createElement("div")
rulesModal.id = "rulesModal"
rulesModal.innerHTML = `
    <div class="rules-content">
        <h2>How to Play ONU</h2>
        <ul>
            <li>Match the top card on the discard pile by color, number, or symbol.</li>
            <li>Use Action cards (Skip, Reverse, Draw Two) to shake up the game.</li>
            <li><strong>Wild Shield Cards (🛡️):</strong> Use these on ANY color to REFLECT a penalty stack (like a +2 or +4) to the next player! You also get to choose the next color.</li>
            <li>Wild cards can be played on any card to change the color.</li>
            <li>Wild Draw Four changes the color and makes the next player draw 4 cards.</li>
            <li><strong>IMPORTANT:</strong> If you have 2 cards left, you MUST click the "ONU" button <em>before</em> playing your second-to-last card.</li>
            <li>If you forget to call ONU, you will be forced to draw 2 penalty cards!</li>
            <li>First player to get rid of all their cards wins!</li>
        </ul>
        <button class="close-rules">Close</button>
    </div>
`
document.body.appendChild(rulesModal)

helpButton.addEventListener("click", () => {
  rulesModal.classList.add("visible")
})
rulesModal.querySelector(".close-rules")!.addEventListener("click", () => {
  rulesModal.classList.remove("visible")
})

// State tracking for animations
let previousHandIds = new Set<string>()
let previousTopDiscardId: string | null = null
let firstRender = true

// Cache positions of cards from the previous frame to enable accurate "from" animations
// Key: CardID, Value: DOMRect
const previousCardPositions = new Map<string, DOMRect>()

// Helper to create card HTML
function createCardElement(
  card: Card,
  isPlayable: boolean = false
): HTMLDivElement {
  const cardElement = document.createElement("div")
  cardElement.className = "card"
  if (card.color) cardElement.classList.add(card.color)
  cardElement.classList.add(card.value)
  cardElement.dataset.cardId = card.id
  cardElement.id = `card-${card.id}`

  // Map values to symbols/text
  let symbol = card.value as string
  if (card.value === "skip") symbol = "⊘"
  else if (card.value === "reverse") symbol = "⇄"
  else if (card.value === "drawTwo") symbol = "+2"
  else if (card.value === "wild") symbol = "W"
  else if (card.value === "wildDrawFour") symbol = "+4"
  else if (card.value === "shield") symbol = "🛡️"
  else if (!isNaN(Number(card.value))) {
    // It's a number, leave it as is
  } else {
    // Capitalize if it's text
    symbol = symbol.charAt(0).toUpperCase() + symbol.slice(1)
  }

  const inner = document.createElement("div")
  inner.className = "inner"
  inner.textContent = symbol

  const cornerTop = document.createElement("span")
  cornerTop.className = "corner top"
  cornerTop.textContent = symbol

  const cornerBottom = document.createElement("span")
  cornerBottom.className = "corner bottom"
  cornerBottom.textContent = symbol

  cardElement.appendChild(inner)
  cardElement.appendChild(cornerTop)
  cardElement.appendChild(cornerBottom)

  if (isPlayable) {
    cardElement.classList.add("playable")
    cardElement.addEventListener("click", () => {
      if (card.color === null) {
        // If it's a wild card, show color picker
        wildColorPickerElement.style.display = "flex"
        wildColorPickerElement.dataset.cardId = card.id
      } else {
        Rune.actions.playCard({ cardId: card.id })
      }
    })
  }
  return cardElement
}

function initUI(playerIds: PlayerId[], yourPlayerId: PlayerId | undefined) {
  playersSection.innerHTML = ""
  yourHandElement.innerHTML = ""
  discardPileElement.innerHTML = ""
  drawPileElement.innerHTML = ""

  wildColorPickerElement.innerHTML = `
    <button class="color-btn red" data-color="red"></button>
    <button class="color-btn blue" data-color="blue"></button>
    <button class="color-btn green" data-color="green"></button>
    <button class="color-btn yellow" data-color="yellow"></button>
  `
  wildColorPickerElement.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const selectedColor = (e.target as HTMLButtonElement).dataset
        .color as Exclude<Color, null>
      const cardId = wildColorPickerElement.dataset.cardId
      if (cardId && selectedColor) {
        Rune.actions.playCard({ cardId, selectedColor })
        wildColorPickerElement.style.display = "none"
        wildColorPickerElement.dataset.cardId = ""
      }
    })
  })
  wildColorPickerElement.style.display = "none"

  playerIds.forEach((playerId) => {
    const playerInfo = Rune.getPlayerInfo(playerId)
    const li = document.createElement("li")
    li.id = `player-${playerId}`
    li.className = "player-info"
    li.innerHTML = `
      <img src="${playerInfo.avatarUrl}" alt="${playerInfo.displayName}" />
      <span class="player-name">${playerInfo.displayName}</span>
      <span class="card-count"></span>
      <span class="onu-status"></span>
    `
    if (playerId === yourPlayerId) {
      li.classList.add("you")
    }
    playersSection.appendChild(li)
  })

  actionButtonsElement.innerHTML = `
    <button id="drawCardButton">${Rune.t("Draw Card")}</button>
    <button id="passTurnButton" style="display:none;">${Rune.t("Pass Turn")}</button>
  `
  const drawCardButton = document.getElementById("drawCardButton")!
  const passTurnButton = document.getElementById("passTurnButton")!

  drawCardButton.addEventListener("click", () => Rune.actions.drawCard())
  passTurnButton.addEventListener("click", () => Rune.actions.passTurn())
  unoButtonElement.addEventListener("click", () => Rune.actions.callOnu())
}

// Animation helper
function animateElement(
  element: HTMLElement,
  startRect: DOMRect,
  endRect: DOMRect
) {
  const deltaX = startRect.left - endRect.left
  const deltaY = startRect.top - endRect.top

  // 1. Instant setup (disable transition, move to start)
  element.style.transition = "none"
  element.style.transform = `translate(${deltaX}px, ${deltaY}px)`

  // 2. Force reflow
  void element.offsetWidth

  requestAnimationFrame(() => {
    // 3. Enable animation and move to target
    element.style.transition = "" // Restore CSS transition
    element.classList.add("animating") // Apply specific animation curve
    element.style.transform = "" // Move to natural position (0,0)

    // Cleanup after animation
    element.addEventListener(
      "transitionend",
      () => {
        element.classList.remove("animating")
      },
      { once: true }
    )
  })
}

// Helper to update card positions cache
function updateCardPositionsCache() {
  previousCardPositions.clear()

  // Cache hand cards
  const handCards = yourHandElement.querySelectorAll(".card")
  handCards.forEach((el) => {
    const cardId = (el as HTMLElement).dataset.cardId
    if (cardId) {
      previousCardPositions.set(cardId, el.getBoundingClientRect())
    }
  })

  // Cache discard pile card (usually just the top one matters)
  const discardCards = discardPileElement.querySelectorAll(".card")
  discardCards.forEach((el) => {
    const cardId = (el as HTMLElement).dataset.cardId
    if (cardId) {
      previousCardPositions.set(cardId, el.getBoundingClientRect())
    }
  })
}

Rune.initClient({
  onChange: ({ game, yourPlayerId, players, action }) => {
    const {
      deck,
      discardPile,
      players: gamePlayers,
      currentPlayerIndex,
      currentColor,
      winner,
      drawnCard,
      lastAction,
      drawStack,
    } = game

    const yourPlayerState = gamePlayers.find((p) => p.id === yourPlayerId)!
    const isYourTurn = gamePlayers[currentPlayerIndex].id === yourPlayerId

    if (playersSection.children.length === 0) {
      initUI(Object.keys(players), yourPlayerId)
    }

    if (lastActionElement) {
      let formattedLastAction = lastAction || ""
      // Regex to find all instances of <PLAYER_NAME:PLAYER_ID>
      const playerPlaceholderRegex = /<PLAYER_NAME:([^>]+)>/g
      formattedLastAction = formattedLastAction.replace(
        playerPlaceholderRegex,
        (match, playerId) => {
          const playerInfo = Rune.getPlayerInfo(playerId)
          return playerInfo ? playerInfo.displayName : playerId
        }
      )
      lastActionElement.textContent = formattedLastAction
    }

    // --- RENDER DISCARD PILE ---
    discardPileElement.innerHTML = ""
    let currentTopCardId: string | null = null

    if (discardPile.length > 0) {
      const topCard = discardPile[discardPile.length - 1]
      currentTopCardId = topCard.id
      const cardElement = createCardElement(topCard)
      discardPileElement.appendChild(cardElement)

      let colorVar = "transparent"
      const activeColor = topCard.color || currentColor
      if (activeColor === "red") colorVar = "var(--card-red)"
      if (activeColor === "blue") colorVar = "var(--card-blue)"
      if (activeColor === "green") colorVar = "var(--card-green)"
      if (activeColor === "yellow") colorVar = "var(--card-yellow)"

      discardPileElement.style.setProperty("--current-color", colorVar)

      // Animation: Play Card (Hand -> Discard)
      if (!firstRender && currentTopCardId !== previousTopDiscardId && action) {
        let sourceRect: DOMRect | undefined = undefined

        // 1. If YOU played the card, check our cache for where it was in your hand
        if (action.playerId === yourPlayerId && action.name === "playCard") {
          sourceRect = previousCardPositions.get(topCard.id)

          // Fallback if cache missed (shouldn't happen if properly tracked)
          if (!sourceRect) {
            const handRect = yourHandElement.getBoundingClientRect()
            sourceRect = {
              left: handRect.left + handRect.width / 2 - 40,
              top: handRect.top,
            } as DOMRect
          }
        }
        // 2. If OPPONENT played the card
        else if (
          action.playerId !== yourPlayerId &&
          action.name === "playCard"
        ) {
          const playerEl = document.getElementById(`player-${action.playerId}`)
          if (playerEl) {
            sourceRect = playerEl.getBoundingClientRect()
          }
        }

        if (sourceRect) {
          const destRect = discardPileElement.getBoundingClientRect()
          animateElement(cardElement, sourceRect, destRect)
        }
      }
    } else {
      discardPileElement.style.setProperty("--current-color", "transparent")
    }

    // --- RENDER DRAW PILE ---
    drawPileElement.innerHTML = ""
    if (deck.length > 0 || drawnCard) {
      const drawCardPlaceholder = document.createElement("div")
      drawCardPlaceholder.className = "card back"
      const onuText = document.createElement("div")
      onuText.className = "card-back-onu-text"
      onuText.textContent = "ONU"
      drawCardPlaceholder.appendChild(onuText)
      drawPileElement.appendChild(drawCardPlaceholder)
    }

    // --- RENDER YOUR HAND ---
    yourHandElement.innerHTML = ""
    const allCardsInHand = [
      ...yourPlayerState.hand,
      ...(drawnCard ? [drawnCard] : []),
    ]
    const topDiscardCard = discardPile[discardPile.length - 1]
    const currentHandIds = new Set<string>()

    allCardsInHand.forEach((card) => {
      currentHandIds.add(card.id)

      let isPlayable = false
      if (isYourTurn && !winner) {
        if (drawStack > 0) {
          isPlayable = card.value === "drawTwo" || card.value === "wildDrawFour"
        } else {
          isPlayable =
            card.color === null ||
            card.color === currentColor ||
            card.value === topDiscardCard.value
        }
      }

      const cardEl = createCardElement(card, isPlayable)
      yourHandElement.appendChild(cardEl)

      // Animation: Draw Card (Deck -> Hand)
      // If card is NEW in hand and it wasn't there before
      if (
        !firstRender &&
        !previousHandIds.has(card.id) &&
        action &&
        action.name === "drawCard" &&
        action.playerId === yourPlayerId
      ) {
        const drawPileRect = drawPileElement.getBoundingClientRect()

        // Wait for layout to settle for the new card in hand
        requestAnimationFrame(() => {
          const destRect = cardEl.getBoundingClientRect()
          animateElement(cardEl, drawPileRect, destRect)
        })
      }
    })

    // --- RENDER PLAYERS ---
    // 1. Sync: Add missing players
    gamePlayers.forEach((playerState) => {
      let playerContainer = document.getElementById(`player-${playerState.id}`)

      if (!playerContainer) {
        const playerInfo = players[playerState.id] // Use Rune player info
        if (playerInfo) {
          playerContainer = document.createElement("li")
          playerContainer.id = `player-${playerState.id}`
          playerContainer.className = "player-info"
          playerContainer.innerHTML = `
            <img src="${playerInfo.avatarUrl}" alt="${playerInfo.displayName}" />
            <span class="player-name">${playerInfo.displayName}</span>
            <span class="card-count"></span>
            <span class="onu-status"></span>
          `
          if (playerState.id === yourPlayerId) {
            playerContainer.classList.add("you")
          }
          playersSection.appendChild(playerContainer)
        }
      }

      // Update UI for this player
      if (playerContainer) {
        const isCurrentPlayer =
          playerState.id === gamePlayers[currentPlayerIndex].id
        playerContainer.classList.toggle("current-turn", isCurrentPlayer)

        const countSpan = playerContainer.querySelector(".card-count")!
        let countText = `${playerState.hand.length} Cards`
        if (isCurrentPlayer && isYourTurn && drawStack > 0) {
          countText += ` (Draw ${drawStack})`
        }
        countSpan.textContent = countText

        playerContainer.querySelector(".onu-status")!.textContent =
          playerState.hasCalledOnu ? "ONU!" : ""
      }
    })

    // 2. Sync: Remove left players
    const currentPlayerIds = new Set(gamePlayers.map((p) => p.id))
    Array.from(playersSection.children).forEach((child) => {
      const id = child.id.replace("player-", "")
      if (!currentPlayerIds.has(id)) {
        playersSection.removeChild(child)
      }
    })

    const drawCardButton = document.getElementById("drawCardButton")!
    const passTurnButton = document.getElementById("passTurnButton")!

    if (isYourTurn && !winner) {
      if (drawnCard) {
        drawCardButton.style.display = "none"
        passTurnButton.style.display = "block"
      } else {
        drawCardButton.style.display = "block"
        passTurnButton.style.display = "none"
      }
    } else {
      drawCardButton.style.display = "none"
      passTurnButton.style.display = "none"
    }

    if (
      isYourTurn &&
      !winner &&
      yourPlayerState.hand.length <= 2 &&
      !yourPlayerState.hasCalledOnu
    ) {
      unoContainer.style.display = "flex"
    } else {
      unoContainer.style.display = "none"
    }

    if (yourPlayerState.hasCalledOnu) {
      unoButtonElement.classList.add("active")
      unoContainer.style.display = "none"
    }

    if (winner) {
      lastActionElement.textContent = `${winner} won the game!`
      actionButtonsElement.style.display = "none"
      wildColorPickerElement.style.display = "none"
      unoContainer.style.display = "none"
    } else {
      actionButtonsElement.style.display = "flex"
    }

    // Update state for next render
    previousHandIds = currentHandIds
    previousTopDiscardId = currentTopCardId
    firstRender = false

    // IMPORTANT: Update cache of card positions AFTER the DOM is fully rendered and browser has laid it out.
    requestAnimationFrame(() => {
      updateCardPositionsCache()
    })
  },
})
