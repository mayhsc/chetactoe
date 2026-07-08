package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	// "chetactoe/internal/engine"
)

func CreateEmptyBoard() fyne.CanvasObject {
	var items []fyne.CanvasObject

	for i := 0; i < 4; i++ {
		for j := 0; j < 4; j++ {
			var boxColor color.Color
			;
			if ((i + j) % 2 == 0) {
				boxColor = color.Black
			} else {
				boxColor = color.White
			}

			item := createBox(boxColor)
			items = append(items, item)
		}
	}

	return container.NewGridWithColumns(4, items...)
}

func createBox(boxColor color.Color) fyne.CanvasObject {
	return canvas.NewRectangle(boxColor)
}
