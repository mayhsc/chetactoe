package main

import (
	"chetactoe/cmd/wasm/controller"
	"syscall/js"
)

func main() {
	js.Global().Set("StartGame", js.FuncOf(controller.StartGame))
	js.Global().Set("StartNetworkGame", js.FuncOf(controller.StartNetworkGame))

	select {}
}
