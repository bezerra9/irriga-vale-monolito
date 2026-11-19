from datetime import UTC, datetime, time, timedelta

from app.models import ZoneManagement
from app.services import rules
from app.services.time_utils import in_quiet_hours, next_window
from app.services.zone_status import ZoneStatus, compute_zone_status

NOW = datetime(2026, 11, 12, 15, 0, tzinfo=UTC)


def test_needs_irrigation_only_below_dry_threshold():
    assert rules.needs_irrigation(29, 30, ZoneManagement.normal)
    assert not rules.needs_irrigation(30, 30, ZoneManagement.normal)


def test_planned_stress_never_recommends_irrigation():
    assert not rules.needs_irrigation(5, 30, ZoneManagement.planned_stress)
    assert not rules.is_warning(32, 30, ZoneManagement.planned_stress)


def test_warning_band_is_above_dry_threshold():
    assert rules.is_warning(35, 30, ZoneManagement.normal)
    assert not rules.is_warning(40, 30, ZoneManagement.normal)


def test_target_reached_near_wet_threshold():
    assert rules.target_reached(66, 70)
    assert not rules.target_reached(64, 70)


def test_low_battery_threshold():
    assert rules.is_low_battery(20)
    assert not rules.is_low_battery(21)
    assert not rules.is_low_battery(None)


def test_volume_estimate_scales_with_area_and_time():
    assert rules.estimate_volume_l(2.0, 60) == 3000
    assert rules.estimate_volume_l(2.0, 30) == 1500


def test_zone_status_offline_after_window():
    status = compute_zone_status(
        moisture=50,
        last_reading_at=NOW - timedelta(minutes=45),
        dry_threshold=30,
        wet_threshold=70,
        management=ZoneManagement.normal,
        now=NOW,
        offline_after=timedelta(minutes=30),
    )
    assert status == ZoneStatus.offline


def test_zone_status_levels():
    def status(m, mgmt=ZoneManagement.normal):
        return compute_zone_status(
            moisture=m,
            last_reading_at=NOW,
            dry_threshold=30,
            wet_threshold=70,
            management=mgmt,
            now=NOW,
            offline_after=timedelta(minutes=30),
        )

    assert status(22) == ZoneStatus.dry
    assert status(35) == ZoneStatus.attention
    assert status(50) == ZoneStatus.ideal
    assert status(75) == ZoneStatus.wet
    assert status(22, ZoneManagement.planned_stress) == ZoneStatus.planned_stress


def test_quiet_hours_cross_midnight():
    start, end = time(22, 0), time(5, 0)
    assert in_quiet_hours(time(23, 30), start, end)
    assert in_quiet_hours(time(2, 0), start, end)
    assert not in_quiet_hours(time(12, 0), start, end)
    assert not in_quiet_hours(time(5, 0), start, end)


def test_next_window_is_strictly_after_and_in_local_time():
    # 15:00 UTC = 12:00 em Recife (UTC-3). A próxima janela às 05:00 local é amanhã 08:00 UTC.
    result = next_window("America/Recife", time(5, 0), NOW)
    assert result == datetime(2026, 11, 13, 8, 0, tzinfo=UTC)
    # Antes das 05:00 local, a janela é no mesmo dia.
    early = datetime(2026, 11, 12, 7, 0, tzinfo=UTC)  # 04:00 local
    assert next_window("America/Recife", time(5, 0), early) == datetime(
        2026, 11, 12, 8, 0, tzinfo=UTC
    )
