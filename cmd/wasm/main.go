package main

import (
	"syscall/js"
	"chetactoe/cmd/wasm/controller"
)

func main() {
	js.Global().Set("StartGame", js.FuncOf(controller.StartGame))

	select {}
}

