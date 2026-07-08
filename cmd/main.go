package main

import (
	"fyne.io/fyne/v2/app"
	"chetactoe/internal/ui"
)

func main() {
	a := app.New()
	w := a.NewWindow("CheTacToe!")

	w.SetContent(ui.CreateEmptyBoard())
	w.ShowAndRun()
}