package main

import (
	"syscall/js"
	"chetactoe/cmd/wasm/controller"
)

func main() {
	js.Global().Set("StartLocalGame", js.FuncOf(controller.StartLocalGame))

	select {}
}

