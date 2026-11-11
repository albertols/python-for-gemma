# Python for Complete Beginners

*A beginner-friendly companion to the official Python tutorial.*

------------------------------------------------------------------------

# Chapter 1 -- Running Python

## The Python Interpreter

-   `>>>` means Python is waiting for you to type a command.
-   `...` means Python expects more input (for example, when writing
    multi-line code).
-   **Input** is what you type.
-   **Output** is Python's response.

## Comments

``` python
# This is a comment
```

-   Comments start with `#`.
-   Python ignores them.
-   They help humans understand the code.

------------------------------------------------------------------------

# Chapter 2 -- Numbers

## What are numbers?

Python can work like a calculator.

### Operators

  Code   Meaning
  ------ ----------------------------------
  `+`    Add
  `-`    Subtract
  `*`    Multiply
  `/`    Divide (returns a decimal/float)
  `//`   Floor division
  `%`    Remainder
  `**`   Powers

### Variables

``` python
width = 20
height = 5
area = width * height
```

Use `=` to store a value in a variable.

### Number Types

-   `int` → Whole numbers
-   `float` → Decimal numbers

### Useful Functions

``` python
round(number, decimals)
```

### Big Picture

-   `=` Store values
-   `+ - * / // % **` Perform calculations
-   `round()` Round numbers
-   `int` Whole numbers
-   `float` Decimal numbers

------------------------------------------------------------------------

# Chapter 3 -- Strings (Text)

## What is a string?

A string is text enclosed in quotation marks.

``` python
"Hello"
'Hello'
```

## Store Text

``` python
name = "Gemma"
```

## Display Text

``` python
print(name)
```

## Join Strings

``` python
"Hello " + "World"
```

## Repeat Strings

``` python
3 * "ha"
```

## Indexing

``` python
word[0]
word[-1]
```

## Slicing

``` python
word[1:4]
```

Remember: - Start included - End excluded

## Length

``` python
len(word)
```

## Strings are Immutable

Strings cannot be changed after they are created.

### Big Picture

-   `"..."` Create text
-   `=` Store text
-   `print()` Display text
-   `+` Join strings
-   `*` Repeat strings
-   `[]` Index and slice
-   `len()` Count characters
-   Strings are immutable

------------------------------------------------------------------------

# Chapter 4 -- Lists

## What is a list?

A list stores multiple items together.

``` python
shopping = ["Milk", "Bread", "Eggs"]
```

## Indexing

``` python
shopping[0]
shopping[-1]
```

## Slicing

``` python
shopping[1:3]
```

## Joining Lists

``` python
list1 + list2
```

## Editing Lists

``` python
shopping[1] = "Butter"
```

Lists are **mutable**, so they can be changed.

## Add Items

``` python
shopping.append("Cheese")
```

## Copy a List

``` python
copy = shopping[:]
```

## Nested Lists

``` python
matrix = [[1,2],[3,4]]
matrix[0][1]
```

## Length

``` python
len(shopping)
```

### Big Picture

-   `[]` Create a list
-   `list[0]` Indexing
-   `list[1:3]` Slicing
-   `+` Join lists
-   `.append()` Add an item
-   `list[index] = value` Edit an item
-   `len()` Count items
-   Lists are mutable
-   `copy = list[:]` Create a copy

------------------------------------------------------------------------

# Master Cheat Sheet

  Code          Purpose
  ------------- ------------------------------------
  `=`           Store a value
  `print()`     Display output
  `len()`       Count characters/items
  `round()`     Round a number
  `+`           Add numbers / Join strings & lists
  `-`           Subtract
  `*`           Multiply / Repeat strings
  `/`           Divide
  `//`          Floor division
  `%`           Remainder
  `**`          Powers
  `#`           Comment
  `[]`          Lists, indexing and slicing
  `.append()`   Add item to end of list
