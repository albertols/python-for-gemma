from ai_homework_companion.models import PracticeQuestion, PracticeSet


def test_total_marks():
    ps = PracticeSet(
        title="Green Grocers Ltd",
        case_study="Green Grocers Ltd is a family-run...",
        questions=[
            PracticeQuestion("Define", 2, "Define the term 'opportunity cost'."),
            PracticeQuestion("Assess", 12, "Assess whether Green Grocers should expand online."),
        ],
    )
    assert ps.total_marks() == 14
