package ui

import (
	"fyne.io/fyne/v2"
	// "fyne.io/fyne/v2/widget"
	"fyne.io/fyne/v2/container"
	// "chetactoe/internal/engine"
)

func CreateEmptyBoard() fyne.CanvasObject {
	// board := engine.NewBoard();

	return container.NewGridWithColumns(4, );
}
