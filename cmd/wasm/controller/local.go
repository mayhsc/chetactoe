package controller

import (
	"chetactoe/internal/engine"
	"encoding/json"
	"syscall/js"
)

func StartGame(this js.Value, args []js.Value) interface{} {
	mode := args[0].String()
	onSnapshot := args[1]

	actChan := make(chan engine.Action, 100)
	snapChan := make(chan engine.GameSnapshot, 100)

	switch mode {
	case "local":
		go engine.StartLocalGame(actChan, snapChan)
	case "bot-white":
		go engine.StartBotGame(actChan, snapChan, engine.White)
	case "bot-black":
		go engine.StartBotGame(actChan, snapChan, engine.Black)
	default:
		return js.ValueOf(map[string]interface{}{
			"error": "unknown game mode: " + mode,
		})
	}

	go func() {
		for snap := range snapChan {
			deliver(onSnapshot, mapSnapshotToJson(snap))
		}
	}()

	return js.ValueOf(map[string]interface{}{
		"sendAction": js.FuncOf(func(this js.Value, args []js.Value) any {
			jsJson := js.Global().Get("JSON").Call("stringify", args[0]).String()

			act, err := mapActionToStruct(jsJson)
			if err != nil {
				return err.Error()
			}

			go func() {
				actChan <- act
			}()

			return nil
		}),
	})
}

// deliver hands one snapshot to the page.
//
// The recover matters more than it looks: js.Value.Invoke turns a JavaScript
// exception into a Go panic, and a panic in this goroutine takes the whole
// WebAssembly program with it. A typo in the client's render function was enough
// to kill the engine mid-game, and the only symptom was every later action
// failing with "Go program has already exited" — which points nowhere near the
// actual mistake.
func deliver(onSnapshot js.Value, payload string) {
	defer func() {
		if r := recover(); r != nil {
			js.Global().Get("console").Call("error", "chetactoe: the page threw while drawing a snapshot:", r)
		}
	}()

	onSnapshot.Invoke(payload)
}

func mapActionToStruct(jsData string) (engine.Action, error) {
	var action engine.Action
	err := json.Unmarshal([]byte(jsData), &action)

	if err != nil {
		return engine.Action{}, err
	}

	return action, nil
}

func mapSnapshotToJson(snapshot engine.GameSnapshot) string {
	a, err := json.Marshal(snapshot)

	if err != nil {
		return "{ \"error\": \"failed to marshal snapshot\" }"
	}

	return string(a)
}
