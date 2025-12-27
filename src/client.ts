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
const unoButtonElement = document.getElementById("unoButton")!
const lastActionElement = document.getElementById("lastAction")!

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

  // Map values to symbols/text
  let symbol = card.value as string
  if (card.value === "skip") symbol = "⊘"
  else if (card.value === "reverse") symbol = "⇄"
  else if (card.value === "drawTwo") symbol = "+2"
  else if (card.value === "wild") symbol = "W"
  else if (card.value === "wildDrawFour") symbol = "+4"
  else if (!isNaN(Number(card.value))) {
    // It's a number, leave it as is
  } else {
    // Capitalize if it's text (rare in Uno, usually symbols, but just in case)
    symbol = symbol.charAt(0).toUpperCase() + symbol.slice(1)
  }

  const inner = document.createElement("div")
  inner.className = "inner"
  inner.textContent = symbol

  // Add small corner values for better readability
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
  // Clear existing UI elements if any
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
  wildColorPickerElement.style.display = "none" // Hide initially

  // Create player containers
  playerIds.forEach((playerId) => {
    const playerInfo = Rune.getPlayerInfo(playerId)
    const li = document.createElement("li")
    li.id = `player-${playerId}`
    li.className = "player-info"
    li.innerHTML = `
      <img src="${playerInfo.avatarUrl}" alt="${playerInfo.displayName}" />
      <span class="player-name">${playerInfo.displayName}</span>
      <span class="card-count"></span>
      <span class="uno-status"></span>
    `
    if (playerId === yourPlayerId) {
      li.classList.add("you")
    }
    playersSection.appendChild(li)
  })

  // Action buttons
  actionButtonsElement.innerHTML = `
    <button id="drawCardButton">${Rune.t("Draw Card")}</button>
    <button id="passTurnButton" style="display:none;">${Rune.t("Pass Turn")}</button>
  `
  const drawCardButton = document.getElementById("drawCardButton")!
  const passTurnButton = document.getElementById("passTurnButton")!

  drawCardButton.addEventListener("click", () => Rune.actions.drawCard())
  passTurnButton.addEventListener("click", () => Rune.actions.passTurn())
  unoButtonElement.addEventListener("click", () => Rune.actions.callUno())
}

Rune.initClient({
  onChange: ({ game, yourPlayerId, players }) => {
    const {
      deck,
      discardPile,
      players: gamePlayers,
      currentPlayerIndex,
      // Removed 'direction' as it's not directly used for UI rendering in onChange
      currentColor,
      winner,
      drawnCard,
      lastAction,
      drawStack,
    } = game

    const yourPlayerState = gamePlayers.find((p) => p.id === yourPlayerId)!
    const isYourTurn = gamePlayers[currentPlayerIndex].id === yourPlayerId

    // Initialize UI if not already done
    if (playersSection.children.length === 0) {
      initUI(Object.keys(players), yourPlayerId)
    }

    // Last action message
    if (lastActionElement) {
      lastActionElement.textContent = lastAction || ""
    }

    // Render Discard Pile
    discardPileElement.innerHTML = ""
    if (discardPile.length > 0) {
      const topCard = discardPile[discardPile.length - 1]
      // Use createCardElement but we might want to tweak it if we need to show the 'active' color for wilds
      const cardElement = createCardElement(topCard)
      discardPileElement.appendChild(cardElement)

      // Update the discard pile's glow based on current color (useful for wilds)
      const activeColor = topCard.color || currentColor
      // Map internal color names to CSS variables if needed, or just class names
      // We set a custom property on the parent to handle the glow border color
      let colorVar = "transparent"
      if (activeColor === "red") colorVar = "var(--card-red)"
      if (activeColor === "blue") colorVar = "var(--card-blue)"
      if (activeColor === "green") colorVar = "var(--card-green)"
      if (activeColor === "yellow") colorVar = "var(--card-yellow)"

      discardPileElement.style.setProperty("--current-color", colorVar)
    } else {
      discardPileElement.style.setProperty("--current-color", "transparent")
    }

    // Render Draw Pile
    drawPileElement.innerHTML = ""
    if (deck.length > 0 || drawnCard) {
      // Show draw pile if there are cards in deck or one is drawn
      const drawCardPlaceholder = document.createElement("div")
      drawCardPlaceholder.className = "card back"
      drawPileElement.appendChild(drawCardPlaceholder)
    }

    // Render Your Hand
    yourHandElement.innerHTML = ""
    const allCardsInHand = [
      ...yourPlayerState.hand,
      ...(drawnCard ? [drawnCard] : []),
    ]
    const topDiscardCard = discardPile[discardPile.length - 1]

    allCardsInHand.forEach((card) => {
      let isPlayable = false
      if (isYourTurn && !winner) {
        // If there's a draw stack, only +2 or +4 can be played, OR player must draw
        if (drawStack > 0) {
          isPlayable = card.value === "drawTwo" || card.value === "wildDrawFour"
        } else {
          isPlayable =
            card.color === null ||
            card.color === currentColor ||
            card.value === topDiscardCard.value
        }
      }
      yourHandElement.appendChild(createCardElement(card, isPlayable))
    })

    // Render Player Info
    gamePlayers.forEach((playerState) => {
      const playerContainer = document.getElementById(
        `player-${playerState.id}`
      )
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

        playerContainer.querySelector(".uno-status")!.textContent =
          playerState.hasCalledUno ? "UNO!" : ""
      }
    })

    // Action button visibility
    const drawCardButton = document.getElementById("drawCardButton")!
    const passTurnButton = document.getElementById("passTurnButton")!

    // Logic:
    // If it's your turn, you haven't won, and you don't have a pending drawn card to play/pass: Show Draw
    // If you have a drawn card (you just drew), show Pass (or Play is handled by card click)
    // Actually the logic for buttons:
    // If (isYourTurn)
    //   If (drawnCard) -> Show "Pass Turn" (You can play the drawn card by clicking it, or pass)
    //   Else -> Show "Draw Card"

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

    // Uno button logic
    // Show if you have 1 or 2 cards (so you can call it before playing the second to last)
    // actually standard UNO rules: Call UNO when playing your second-to-last card.
    // Logic here checks <= 2 cards.
    if (
      isYourTurn &&
      !winner &&
      yourPlayerState.hand.length <= 2 &&
      !yourPlayerState.hasCalledUno
    ) {
      unoButtonElement.style.display = "block"
    } else {
      unoButtonElement.style.display = "none"
    }

    // Toggle active state for visual feedback
    if (yourPlayerState.hasCalledUno) {
      unoButtonElement.classList.add("active")
      // Keep it visible maybe? Or hide it? Usually you call it once.
      // If we want to show "You called UNO", we can disable it or style it.
      // For now let's hide it to avoid confusion or keep it as status.
      // The prompt says "UI should feel calm and predictable".
      // If I called it, I don't need to call it again.
      unoButtonElement.style.display = "none"
    }

    // Handle game over
    if (winner) {
      lastActionElement.textContent = `${winner} won the game!`
      actionButtonsElement.style.display = "none"
      wildColorPickerElement.style.display = "none"
      unoButtonElement.style.display = "none"
    } else {
      actionButtonsElement.style.display = "flex"
    }
  },
})
