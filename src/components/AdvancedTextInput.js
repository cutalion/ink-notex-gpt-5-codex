import React, {useEffect, useMemo, useState} from 'react';
import {Text, useInput} from 'ink';
import chalk from 'chalk';

const defaultValue = value => (typeof value === 'string' ? value : '');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isWordChar = char => /[\p{L}\p{N}_]/u.test(char);

const findWordStart = (value, cursor) => {
  if (cursor <= 0) {
    return 0;
  }

  let index = cursor;

  // Skip leading whitespace directly before cursor
  while (index > 0 && !isWordChar(value[index - 1])) {
    index--;
  }

  // Traverse the word characters
  while (index > 0 && isWordChar(value[index - 1])) {
    index--;
  }

  return index;
};

const findWordEnd = (value, cursor) => {
  if (cursor >= value.length) {
    return value.length;
  }

  let index = cursor;

  while (index < value.length && !isWordChar(value[index])) {
    index++;
  }

  while (index < value.length && isWordChar(value[index])) {
    index++;
  }

  return index;
};

const AdvancedTextInput = ({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  highlightPastedText = false,
  showCursor = true,
  onChange,
  onSubmit
}) => {
  const value = defaultValue(originalValue);
  const [state, setState] = useState({cursorOffset: value.length, cursorWidth: 0});
  const {cursorOffset, cursorWidth} = state;

  useEffect(() => {
    if (!focus || !showCursor) {
      return;
    }

    const nextValue = defaultValue(originalValue);

    setState(previous => {
      if (previous.cursorOffset > nextValue.length) {
        return {
          cursorOffset: nextValue.length,
          cursorWidth: 0
        };
      }

      return previous;
    });
  }, [focus, originalValue, showCursor]);

  const maskedValue = useMemo(() => {
    if (!mask) {
      return value;
    }

    return mask.repeat(value.length);
  }, [mask, value]);

  const renderContent = () => {
    if (!showCursor || !focus) {
      if (maskedValue.length > 0) {
        return maskedValue;
      }

      return placeholder ? chalk.grey(placeholder) : '';
    }

    const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
    let renderedValue = maskedValue.length > 0 ? '' : chalk.inverse(' ');
    let renderedPlaceholder = placeholder
      ? chalk.inverse(placeholder[0] ?? ' ') + chalk.grey(placeholder.slice(1))
      : chalk.inverse(' ');

    let index = 0;
    for (const char of maskedValue) {
      const withinCursor =
        index >= cursorOffset - cursorActualWidth && index <= cursorOffset;
      renderedValue += withinCursor ? chalk.inverse(char) : char;
      index++;
    }

    if (maskedValue.length > 0 && cursorOffset === maskedValue.length) {
      renderedValue += chalk.inverse(' ');
    }

    if (placeholder) {
      return maskedValue.length > 0 ? renderedValue : renderedPlaceholder;
    }

    return renderedValue;
  };

  useInput(
    (input, key) => {
      if (!focus) {
        return;
      }

      if (key.upArrow || key.downArrow || key.tab || (key.shift && key.tab)) {
        return;
      }

      if (key.ctrl && input === 'c') {
        return;
      }

      if (key.return) {
        if (onSubmit) {
          onSubmit(value);
        }

        return;
      }

      let nextValue = value;
      let nextCursorOffset = cursorOffset;
      let nextCursorWidth = 0;
      let handled = false;

      if (key.ctrl) {
        switch (input) {
          case 'a': {
            nextCursorOffset = 0;
            handled = true;
            break;
          }
          case 'e': {
            nextCursorOffset = value.length;
            handled = true;
            break;
          }
          case 'w': {
            handled = true;
            if (cursorOffset > 0) {
              const start = findWordStart(value, cursorOffset);
              nextValue = value.slice(0, start) + value.slice(cursorOffset);
              nextCursorOffset = start;
            }
            break;
          }
          default: {
            // Check for Ctrl+Arrow combinations
            if (key.leftArrow) {
              nextCursorOffset = findWordStart(value, cursorOffset);
              handled = true;
            } else if (key.rightArrow) {
              nextCursorOffset = findWordEnd(value, cursorOffset);
              handled = true;
            }
          }
        }
      }

      if (!handled) {
        if (key.leftArrow) {
          nextCursorOffset -= 1;
        } else if (key.rightArrow) {
          nextCursorOffset += 1;
        } else if (key.backspace || key.delete) {
          if (cursorOffset > 0) {
            nextValue = value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
            nextCursorOffset -= 1;
          }
        } else {
          nextValue = value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
          nextCursorOffset += input.length;

          if (input.length > 1) {
            nextCursorWidth = input.length;
          }
        }
      }

      nextCursorOffset = clamp(nextCursorOffset, 0, nextValue.length);

      if (!handled || nextValue !== value) {
        setState({cursorOffset: nextCursorOffset, cursorWidth: nextCursorWidth});
      } else {
        setState({cursorOffset: nextCursorOffset, cursorWidth: 0});
      }

      if (nextValue !== value && onChange) {
        onChange(nextValue);
      }
    },
    {isActive: focus}
  );

  const rendered = renderContent();

  return React.createElement(Text, null, rendered);
};

export default AdvancedTextInput;
