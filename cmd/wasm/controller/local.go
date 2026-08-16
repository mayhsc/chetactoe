package controller

import (
	"chetactoe/internal/engine"
	"encoding/json"
	"syscall/js"
)

func StartLocalGame(this js.Value, args []js.Value) interface{} {
	onSnapshot := args[0]

	actChan := make(chan engine.Action, 100)
	snapChan := make(chan engine.GameSnapshot, 100)

	go engine.StartLocalGame(actChan, snapChan)

	go func() {
		for snap := range snapChan {
			onSnapshot.Invoke(mapSnapshotToJson(snap))
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
