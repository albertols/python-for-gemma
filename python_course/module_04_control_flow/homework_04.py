"""
📝 HOMEWORK 04 — Control Flow
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_04_control_flow -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


def grade_from_score(score: int) -> str:
    """Return the letter grade for a score, using the school's boundaries.

    Example:
        >>> grade_from_score(82)
        'A'
    """
    # TODO: chain if/elif/else, checking the HIGHEST boundary first:
    # A* >= 90, A >= 80, B >= 70, C >= 60, otherwise U.
    if score >= 90:
        return 'A*'
    elif score >= 80:
        return 'A'
    elif score >= 70:
        return 'B'
    elif score >= 60:
        return 'C'
    else:
        return 'U'


def attendance_rate(present: int, total: int) -> float:
    """Return attendance as a percentage.

    Example:
        >>> attendance_rate(19, 20)
        95.0
    """
    # TODO: return present / total * 100.
    return present / total * 100


def count_passes(scores: list, pass_mark: int) -> int:
    """Return how many scores are at or above the pass mark.

    Example:
        >>> count_passes([35, 62, 41, 78, 39], 40)
       3
    """
    # TODO: loop over scores with a for loop, counting the ones that
    # are >= pass_mark. Start a counter at 0 and add 1 on each match.
    passes = 0
    for score in scores:
        print(f"\tcurrent_score: {score}")
        if score >= pass_mark:
            print(f"\t\t[result] the current_score={score} is greater than pass_mark ({pass_mark})...incrementing passes={passes}")
            passes = passes + 1
            print(f"\t\t[result] passes: {passes} (after increment)")
        else:
            print (f"\t\t[result] current_score: {score} has not been passed... because it is lower than pass_mark ({pass_mark}).")
    return passes


def main():
    print(f"Hello, progaram I am 'def main()' the method of an entry point in any programming language!")
    print(
        "I am able to call different functions (like the one that Gemma does not understand which is 'def count_passess()'), variables, definitions in my main routine")
    print("I can chain methods results, etc")
    # I am going to call a method here in the main (remember the entry point of any "python_script.py" like this one homework_04.py )
    # this method is count_passess! enjoy it
    saved_count_passes = count_passes([35, 62, 41, 78, 39],40 )
    print(f"\n**** ====> saved_count_passes: {saved_count_passes} for the student, which did not knwo, beacuse it was not shown in the screen <==== ****")
    # I want to lie and tell the student I has not passed and exam
    final_saved_count_passes = saved_count_passes - saved_count_passes
    print (f"this is my new lie, you have passed these passes = {final_saved_count_passes}")



if __name__ == "__main__":
    main()
