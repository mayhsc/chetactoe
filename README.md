# Chetactoe

A 4×4 chess/tic-tac-toe hybrid.

| directory | what |
| --- | --- |
| `internal/engine` | the game engine — board, pieces, hands, move state |
| `internal/network` | UDP discovery and the TCP session between two players |
| `web/` | the WebGPU web client — see [`web/README.md`](web/README.md) |

## TODO
1) Drop UDP scanning and broadcasting after TCP connection has been established
