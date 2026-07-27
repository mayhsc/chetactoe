package main

import (
	// "embed"

	// "github.com/wailsapp/wails/v2"
	// "github.com/wailsapp/wails/v2/pkg/options"
	// "github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"chetactoe/internal/engine"
)

// var assets embed.FS

func main() {
	// 	app := NewApp()

	// 	err := wails.Run(&options.App{
	// 		Title:  "chetactoe",
	// 		Width:  1024,
	// 		Height: 768,
	// 		AssetServer: &assetserver.Options{
	// 			Assets: assets,
	// 		},
	// 		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
	// 		OnStartup:        app.startup,
	// 		Bind: []interface{}{
	// 			app,
	// 		},
	// 	})

	// 	if err != nil {
	// 		println("Error:", err.Error())
	// 	}

	gameBoard := engine.InitializeGameBoard()

	gameBoard.Print()
	gameBoard.MovePiece(engine.Position{
		Row: 2,
		Col: -1,
	}, engine.Position{
		Row: 3,
		Col: 2,
	},
		engine.White,
	)

	gameBoard.Print()

	gameBoard.MovePiece(engine.Position{
		Col: -2,
		Row: 0,
	}, engine.Position{
		Col: 2,
		Row: 1,
	},
		engine.Black,
	)
	gameBoard.Print()

}
