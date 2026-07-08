def calculate_attendance_status(first_in, last_out, shift=None):
    """
    Apply basic HR rules to determine if a person was PRESENT, ABSENT, HALF_DAY, etc.
    This can be expanded later with grace periods, early exits, overtime, etc.
    """
    if not first_in and not last_out:
        return 'ABSENT'
        
    # Basic logic: If there's any punch, mark as PRESENT.
    # In the future, we can compare (last_out - first_in) against shift.duration
    # to determine HALF_DAY.
    return 'PRESENT'

def calculate_working_minutes(first_in, last_out):
    """
    Returns the total working minutes between first_in and last_out
    """
    if not first_in or not last_out:
        return 0
    delta = last_out - first_in
    return int(delta.total_seconds() / 60)
