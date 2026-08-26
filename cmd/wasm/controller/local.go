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

func StartNetworkGame(this js.Value, args []js.Value) interface{} {
	peerSend := args[0].Get("send")
	onSnapshot := args[1]

	actChan := make(chan engine.Action, 100)
	remoteChan := make(chan engine.Move, 100)
	snapChan := make(chan engine.GameSnapshot, 100)

	go engine.StartNetworkGame(actChan, snapChan, engine.NewJSPeer(peerSend))

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
				if act.ActionType == engine.Execute {
					moveJson, _ := json.Marshal(act.Move)
					peerSend.Invoke(string(moveJson))
				}
			}()

			return nil
		}),

		"onRemoteMove": js.FuncOf(func(this js.Value, args []js.Value) any {
			jsJson := args[0].String()
			var move engine.Move
			if err := json.Unmarshal([]byte(jsJson), &move); err != nil {
				return err.Error()
			}
			go func() {
				remoteChan <- move
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
