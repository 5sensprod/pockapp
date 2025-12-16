//go:build windows

package pos

import "syscall"

var winspool = syscall.NewLazyDLL("winspool.drv")
