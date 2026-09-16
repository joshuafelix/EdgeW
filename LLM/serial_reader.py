"""
Ingestion source abstraction: yields raw line strings regardless of whether
they come from a real ESP32 over USB serial, a replayed log file (e.g. a
serial monitor capture exported from Wokwi), or the built-in mock generator.
"""

import time
from typing import Iterator

import mock_stream


def from_serial(port: str, baud: int = 115200) -> Iterator[str]:
    import serial  # pyserial; imported lazily so mock/file modes don't need it

    with serial.Serial(port, baud, timeout=2) as ser:
        while True:
            raw = ser.readline()
            if not raw:
                continue
            yield raw.decode("utf-8", errors="ignore").strip()


def from_wokwi_rfc2217(host: str = "localhost", port: int = 4001, baud: int = 115200) -> Iterator[str]:
    """
    Connect to a Wokwi VS Code simulation's serial output over the network.

    Requires `rfc2217ServerPort = <port>` set in wokwi.toml, and the Wokwi
    simulator tab open/visible in VS Code (it pauses, and this will hang,
    if the simulator tab isn't in view).
    """
    import serial  # pyserial; imported lazily so mock/file modes don't need it

    url = f"rfc2217://{host}:{port}"
    try:
        with serial.serial_for_url(url, baudrate=baud, timeout=2) as ser:
            while True:
                raw = ser.readline()
                if not raw:
                    continue
                yield raw.decode("utf-8", errors="ignore").strip()
    except serial.SerialException as exc:
        raise SystemExit(
            f"Could not connect to Wokwi RFC2217 at {host}:{port}. "
            "Make sure the Wokwi simulator is running and that wokwi.toml sets "
            f"rfc2217ServerPort = {port}. If you do not have Wokwi available, use --source mock instead."
        ) from exc


def from_file(path: str, replay_delay: float = 0.0) -> Iterator[str]:
    """Replay a captured log file. Set replay_delay>0 to simulate real timing."""
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            yield line.strip()
            if replay_delay:
                time.sleep(replay_delay)


def from_mock(interval: float = 5.0) -> Iterator[str]:
    yield from mock_stream.generate(interval=interval)


def get_source(kind: str, **kwargs) -> Iterator[str]:
    if kind == "serial":
        return from_serial(kwargs["port"], kwargs.get("baud", 115200))
    if kind == "wokwi":
        return from_wokwi_rfc2217(
            kwargs.get("host", "localhost"), kwargs.get("rfc2217_port", 4001), kwargs.get("baud", 115200)
        )
    if kind == "file":
        return from_file(kwargs["path"], kwargs.get("replay_delay", 0.0))
    if kind == "mock":
        return from_mock(kwargs.get("interval", 5.0))
    raise ValueError(f"unknown source kind: {kind}")