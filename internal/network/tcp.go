package network

import (
	"errors"
	"fmt"
	"net"
)

func StartHost(udpPort, tcpPort int) (net.Conn, error) {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", tcpPort))

	if err != nil {
		return nil, err
	}
	defer listener.Close()

	stop := make(chan struct{})
	go BoradcastPresence(udpPort, stop)
	defer close(stop)

	conn, err := listener.Accept()

	if err != nil {
		return nil, err
	}

	return conn, nil
}

func ConnectToPeer(tcpPort int, addr *net.Addr) (net.Conn, error) {
	udpAddr, ok := (*addr).(*net.UDPAddr)
	if !ok {
		return nil, errors.New("expected a UDP address from discovery")
	}

	target := &net.TCPAddr{
		IP:   udpAddr.IP,
		Port: tcpPort,
	}

	conn, err := net.DialTCP("tcp", nil, target)
	if err != nil {
		return nil, err
	}

	return conn, nil
}
