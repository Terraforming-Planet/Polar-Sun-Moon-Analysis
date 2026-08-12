import math
from datetime import UTC, datetime

DT = 75.4
T0 = 18.0
X = (0.4755140, 0.5189249, -0.0000773, -0.0000080)
Y = (0.7711830, -0.2301680, -0.0001246, 0.0000038)
D = (14.7966700, -0.0120650, -0.0000030, 0.0)
L1 = (0.5379550, 0.0000939, -0.0000121, 0.0)
L2 = (-0.0081420, 0.0000935, -0.0000121, 0.0)
MU = (88.747787, 15.003090, 0.0, 0.0)
TAN_F1 = 0.0046141
TAN_F2 = 0.0045911


def poly(values: tuple[float, ...], t: float) -> float:
    return values[0] + values[1] * t + values[2] * t**2 + values[3] * t**3


def overlap(rm: float, rs: float, distance: float) -> float:
    if distance >= rm + rs:
        return 0.0
    if distance <= abs(rm - rs):
        return min(1.0, min(rm, rs) ** 2 / rs**2)
    a = math.acos((distance**2 + rm**2 - rs**2) / (2 * distance * rm))
    b = math.acos((distance**2 + rs**2 - rm**2) / (2 * distance * rs))
    term = (
        (-distance + rm + rs)
        * (distance + rm - rs)
        * (distance - rm + rs)
        * (distance + rm + rs)
    )
    area = rm**2 * a + rs**2 * b - 0.5 * math.sqrt(max(0.0, term))
    return area / (math.pi * rs**2)


def local_state(lat: float, lon: float, when: datetime) -> tuple[float, float]:
    hour = when.hour + when.minute / 60 + when.second / 3600 + DT / 3600
    t = hour - T0
    x, y = poly(X, t), poly(Y, t)
    declination, mu = math.radians(poly(D, t)), poly(MU, t)
    l1, l2 = poly(L1, t), poly(L2, t)
    phi = math.radians(lat)
    flattening = 1 / 298.257223563
    u = math.atan((1 - flattening) * math.tan(phi))
    rho_sin = (1 - flattening) * math.sin(u)
    rho_cos = math.cos(u)
    hour_angle = math.radians(mu + lon)
    xi = rho_cos * math.sin(hour_angle)
    eta = rho_sin * math.cos(declination) - rho_cos * math.cos(hour_angle) * math.sin(
        declination
    )
    zeta = rho_sin * math.sin(declination) + rho_cos * math.cos(hour_angle) * math.cos(
        declination
    )
    distance = math.hypot(x - xi, y - eta)
    local_l1 = l1 - zeta * TAN_F1
    local_l2 = l2 - zeta * TAN_F2
    moon_radius = (local_l1 - local_l2) / 2
    sun_radius = (local_l1 + local_l2) / 2
    obscuration = overlap(moon_radius, sun_radius, distance)
    altitude = math.degrees(
        math.asin(
            math.sin(phi) * math.sin(declination)
            + math.cos(phi) * math.cos(declination) * math.cos(hour_angle)
        )
    )
    return obscuration, altitude


def test_olszowka_obscuration_at_1740_utc() -> None:
    obscuration, altitude = local_state(
        53.61586,
        18.99546,
        datetime(2026, 8, 12, 17, 40, tzinfo=UTC),
    )

    assert 0.40 < obscuration < 0.41
    assert 4.3 < altitude < 4.5


def test_totality_near_nasa_central_line_at_1746_utc() -> None:
    obscuration, altitude = local_state(
        65.17167,
        -25.205,
        datetime(2026, 8, 12, 17, 46, tzinfo=UTC),
    )

    assert obscuration > 0.999
    assert altitude > 0
