# Python Notes (So Far)

## 1. Running Python

-   `>>>` = Python is waiting for input.
-   `...` = Continue a multi-line command.
-   **Input** = What you type.
-   **Output** = Python's response.

## 2. Comments

``` python
# This is a comment
```

-   Comments start with `#`.
-   Python ignores comments.

## 3. Numbers

### Operators

  Code   Purpose
  ------ --------------------------
  `+`    Add
  `-`    Subtract
  `*`    Multiply
  `/`    Divide (returns a float)
  `//`   Floor division
  `%`    Remainder
  `**`   Powers

### Variables

``` python
age = 32
price = 19.99
```

Use `=` to store a value in a variable.

### Number Types

-   `int` = Whole numbers
-   `float` = Decimal numbers

### Useful Functions

``` python
round(number, decimals)
```

Rounds a number.

### Special Variable

``` python
_
```

Stores the last result in the Python interpreter.

------------------------------------------------------------------------

## 4. Strings (Text)

### Creating Strings

``` python
"Hello"
'Hello'
```

### Store Text

``` python
name = "Gemma"
```

### Display Text

``` python
print("Hello")
```

### Join Strings

``` python
"Hello " + "World"
```

### Repeat Strings

``` python
3 * "ha"
```

### Escape Characters

``` python
"Don't"
'Don\\'t'
```

### Special Characters

  Code     Meaning
  -------- -----------
  `\\n`    New line
  `\\t`    Tab
  `\\\\`   Backslash

### Raw Strings

``` python
r"C:\Users\Gemma"
```

### Multi-line Strings

``` python
\"\"\"
Line 1
Line 2
\"\"\"
```

### Indexing

``` python
word[0]
word[-1]
```

### Slicing

``` python
word[1:4]
word[:3]
word[3:]
```

Remember: - Start is **included** - End is **excluded**

### Length

``` python
len(word)
```

### Immutable

Strings cannot be changed:

``` python
word[0] = "J"   # Error
```

Create a new string instead:

``` python
"J" + word[1:]
```

------------------------------------------------------------------------

# Quick Cheat Sheet

  Code        Purpose
  ----------- ----------------------------
  `=`         Store a value
  `print()`   Display output
  `len()`     Count characters
  `round()`   Round a number
  `+`         Add numbers / Join strings
  `-`         Subtract
  `*`         Multiply / Repeat strings
  `/`         Divide
  `//`        Floor division
  `%`         Remainder
  `**`        Powers
  `#`         Comment
  `[]`        Indexing / Slicing
  `\\n`       New line
  `\\t`       Tab
