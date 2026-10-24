# kanji-base64

*A compact, lossless format for storing the Kanji lookup table in JavaScript.*


Kanji are characters of Chinese origin used in Japanese writing. In Unicode, they are represented by code points, mostly in the CJK Unified Ideographs blocks, which also contain characters used in Chinese and Korean. For example, 日 has the code point `U+65E5`, and 本 has `U+672C`.

## Embedding a character table in JavaScript

Binary data is compact, but writing it into JavaScript source takes more space. The source stores text describing the bytes, rather than the raw bytes themselves. A two-byte value written as `0x7DEF` takes six ASCII characters, and an array adds brackets, commas, and spaces.

Here are three consecutive values from our table. We can remove the `0x` prefixes and separators, keeping four hexadecimal digits per value, or encode the six underlying bytes as Base64:

| Representation | Example | Size |
| :--- | :--- | ---: |
| Binary (shown in HEX) | `7D EF 80 C3 84 0E` | 6 bytes |
| JavaScript array | `[0x7DEF, 0x80C3, 0x840E]` | 24 chars |
| Joined HEX string | `7DEF80C3840E` | 12 chars |
| Base64 of the raw bytes | `fe+Aw4QO` | 8 chars |

Fixed-width HEX needs no separators. String sizes exclude quotes; each character is one UTF-8 byte. Base64 encodes the raw bytes, not the HEX text.

## The Kanji table: 13-bit indices

The lookup table used here contains a fixed set of kanji, hiragana, katakana, and symbols. Each character has a predefined position in this table. With a shared copy, a character can be represented by its index instead of its Unicode value.

Indices range from 0 to 8191, so they need 13 bits when packed into a bitstream. Twelve bits cover only 0–4095: for example, 龍 is at index **4340**, which is `1000011110100` in binary and cannot fit in 12 bits. The same character takes 16 bits as a Unicode value or 24 bits in UTF-8:

| Encoding | 龍 in binary | Total bits | Reduction vs. UTF-8 |
| :--- | :--- | ---: | ---: |
| UTF-8                  | `11101001 10111110 10001101` | 24 | —      |
| 16-bit Unicode value   | `1001111110001101`           | 16 | 33.33% |
| Bit-packed table index | `1000011110100`              | 13 | 45.83% |

These savings apply to character data encoded with the table. To interpret the indices, both sides need the same lookup table, including its fixed order and unused positions. Our encoder compresses that shared table while preserving every mapping.

## The Kanji table: 8192 positions

The table has 8192 positions, with 6879 occupied entries. Unicode values are not in numerical order, and unused positions leave gaps between character groups. Each position stores a two-byte Unicode value or `0xFFFF` for an unused entry, so the full table takes **16 384 bytes** in binary. Writing each value as four HEX digits doubles that size; Base64 is smaller than HEX, but still larger than the original binary data.

| Representation | Size | After gzip |
| :--- | ---: | ---: |
| 8192 × 2 bytes (binary)     | 16 384 bytes | 13 509 bytes |
| 8192 × 4 chars (joined HEX) | 32 768 chars | 14 849 bytes |
| Base64 of the binary table  | 21 848 chars | 14 033 bytes |

## Encode the table with commands

We can describe the table with a few commands instead of storing every value in full. A command can store a full value, add a difference (delta) to the previous value, generate a series with a constant step, or skip a run of empty positions. The decoder follows these commands to restore the original values and positions.

```text
  Code     Command format            Purpose
────────┼─────────────────────────┼────────────────────────────────────────────────
  00    |  A(value)               |  Store a full 16-bit value.
        |                         |  Use at the start or for a large jump.
────────┼─────────────────────────┼────────────────────────────────────────────────
  01    |  E(count)               |  Restore a run of empty positions.
        |                         |  Keep the previous nonempty value.
────────┼─────────────────────────┼────────────────────────────────────────────────
  02    |  R(start, step, count)  |  Generate a series from an explicit start.
        |                         |  At least three values, including the start.
────────┼─────────────────────────┼────────────────────────────────────────────────
  03    |  P(step, count)         |  Generate a series from previous + step.
        |                         |  At least two values; reuse the previous value.
────────┼─────────────────────────┼────────────────────────────────────────────────
  04+   |  D(delta)               |  Add a signed difference to the previous value.
        |                         |  Small differences need fewer bytes.
────────┴─────────────────────────┴────────────────────────────────────────────────
```

Codes are shown in HEX. For deltas, the code also carries the value: `04` means no change, `05` means `−1`, and `06` means `+1`.

The encoder compares these options and chooses the smallest complete binary stream using dynamic programming. Small deltas and counts take one byte; larger ones need more. The resulting bytes are then encoded as Base64 for embedding in JavaScript.

### Reading the commands

These 20 entries come from positions 40–59 of the table, encoded as a standalone fragment. The Delta encoder is a simplified baseline for comparison: it stores the first value in full, followed by individual deltas. The Full encoder is the implementation provided here; it also selects full values and series to minimize the complete stream.

```text
            Delta encoder                          Full encoder
  Value     Command            Bytes               Command             Bytes
─────────╫───────────────────┼──────────────────╫───────────────────┼──────────────────
  20 1D  ║  A(201D)          | 00 20 1D         ║  A(201D)          |  00 20 1D
  FF 08  ║  D(-8469)         | AD 84 01         ║  A(FF08)          |  00 FF 08
  FF 09  ║  D(+1)            | 06               ║  D(+1)            |  06
  30 14  ║  D(+12555)        | 9A C4 01         ║  A(3014)          |  00 30 14
  30 15  ║  D(+1)            | 06               ║  D(+1)            |  06
  FF 3B  ║  D(-12506)        | B7 C3 01         ║  A(FF3B)          |  00 FF 3B
  FF 3D  ║  D(+2)            | 08               ║  D(+2)            |  08
  FF 5B  ║  D(+30)           | 40               ║  D(+30)           |  40
  FF 5D  ║  D(+2)            | 08               ║  D(+2)            |  08
  30 08  ║  D(+12459)        | DA C2 01         ║  R(3008, +1, 10)  |  02 30 08 02 0A
  30 09  ║  D(+1)            | 06               ║  ...              | 
  30 0A  ║  D(+1)            | 06               ║  ...              | 
  30 0B  ║  D(+1)            | 06               ║  ...              | 
  30 0C  ║  D(+1)            | 06               ║  ...              | 
  30 0D  ║  D(+1)            | 06               ║  ...              | 
  30 0E  ║  D(+1)            | 06               ║  ...              | 
  30 0F  ║  D(+1)            | 06               ║  ...              | 
  30 10  ║  D(+1)            | 06               ║  ...              | 
  30 11  ║  D(+1)            | 06               ║  ...              | 
  FF 0B  ║  D(-12550)        | 8F C4 01         ║  A(FF0B)          |  00 FF 0B
─────────╨───────────────────┴──────────────────╫───────────────────┴──────────────────
  Total:                       32 bytes         ║                      25 bytes
```

Values and bytes are hexadecimal; deltas and counts are decimal. Each `...` marks a value generated by the preceding series, with no additional bytes stored. Joining the bytes in each column produces the streams below:

* 40 bytes / **Original**:<br>`20 1D FF 08 FF 09 30 14 30 15 FF 3B FF 3D FF 5B FF 5D 30 08 30 09 30 0A 30 0B 30 0C 30 0D 30 0E 30 0F 30 10 30 11 FF 0B`
* 32 bytes / **Delta encoder**:<br>`00 20 1D AD 84 01 06 9A C4 01 06 B7 C3 01 08 40 08 DA C2 01 06 06 06 06 06 06 06 06 06 8F C4 01`
* 25 bytes / **Full encoder**:<br>`00 20 1D 00 FF 08 06 00 30 14 06 00 FF 3B 08 40 08 02 30 08 02 0A 00 FF 0B`


### From individual values to a single series

For a regular sequence, one series command is enough. These 20 characters have Unicode values from `3041` to `3054`:

```text
ぁあぃいぅうぇえぉおかがきぎくぐけげこご
```

The Delta encoder writes a full value and nineteen `+1` deltas. The Full encoder writes `R(3041, +1, 20)`: **start at `3041`, add `1`, emit `20` values**.

**HEX**

* 40 bytes / **Original**:<br>`30 41 30 42 30 43 30 44 30 45 30 46 30 47 30 48 30 49 30 4A 30 4B 30 4C 30 4D 30 4E 30 4F 30 50 30 51 30 52 30 53 30 54`
* 22 bytes / **Delta encoder**:<br>`00 30 41 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06 06`
* 5 bytes / **Full encoder**:<br>`02 30 41 02 14`

**Base64**

* 56 chars / **Original**:<br>`MEEwQjBDMEQwRTBGMEcwSDBJMEowSzBMME0wTjBPMFAwUTBSMFMwVA==`
* 32 chars / **Delta encoder**:<br>`ADBBBgYGBgYGBgYGBgYGBgYGBgYGBg==`
* 8 chars / **Full encoder**:<br>`AjBBAhQ=`

The five series bytes store the command, starting value, step, and count. This reduces 40 binary bytes to 5, or 56 Base64 characters to 8. HEX spaces are for readability; Base64 sizes include padding and exclude quotes.

### Across the full table

The example above is especially regular. Across **all 8192 positions**, the encoder combines commands to handle both regular groups and irregular values:

| Method | Binary | Base64 | Gzip of Base64 |
| :--- | ---: | ---: | ---: |
| Original | 16 384 bytes | 21 848 chars | 14 033 bytes |
| Delta encoder | 10 784 bytes | 14 380 chars | 10 094 bytes |
| Full encoder | 10 488 bytes | 13 984 chars | 9 986 bytes |
| Full encoder savings | 35.99% | 35.99% | 28.84% |

**The Full encoder reduces Base64 size by 35.99%, or 28.84% after gzip.**

The Delta encoder uses one initial full value, individual deltas, and empty-run commands. Gzip uses level 9. Measurements cover the table data, excluding decoder code and HTTP headers; compressing an entire JavaScript file may give different results.

## Format details

Full values use two bytes, most significant byte first. Tokens, counts, and encoded steps use unsigned varints: each byte carries seven data bits, and its high bit indicates another byte follows.

ZigZag turns signed deltas and steps into unsigned integers: `0, -1, +1, -2, +2` become `0, 1, 2, 3, 4`. A delta token is `zigzag(delta) + 4`; series steps use ZigZag without the offset.

Arithmetic wraps modulo 65536, so adding 2 to `FFFE` gives `0000`. Deltas and steps use the range `-32768…32767`. Empty runs preserve the previous nonempty value; series never cross empty positions. `FFFF` is reserved for empty entries.

The encoder minimizes binary size, not gzip size. The stream contains no header, version, or checksum.
