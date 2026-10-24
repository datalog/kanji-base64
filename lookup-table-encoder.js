/**
	Kanji lookup table encoder
	lookup-table-encoder.js has no dependencies.
	https://github.com/datalog/kanji-base64
	Licensed under the MIT License.
	Copyright (c) 2026 Constantine
*/

/**
	encodeTable(values) -> Base64; encodeTableBytes(values) -> bytes. 0xFFFF is empty.
*/

'use strict';

function encodeBase64( bytes ) { /* bytes to base64; btoa() encodes binary strings. */
	var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' ,parts = [] ,i = 0 ,a ,b ,c;
	if( !bytes || 'object' !== typeof bytes || bytes.length !== ( bytes.length >>> 0 ) )
		throw new Error( 'Invalid byte array' );
	for( ; i < bytes.length; i++ )
		if( 'number' !== typeof bytes[ i ] || bytes[ i ] !== ( bytes[ i ] & 255 ) )
			throw new Error( 'Invalid byte' );
	for( i = 0; i < bytes.length; i += 3 ) {
		a = bytes[ i ];
		b = i + 1 < bytes.length ? bytes[ i + 1 ] : 0;
		c = i + 2 < bytes.length ? bytes[ i + 2 ] : 0;
		parts.push( alphabet.charAt( a >>> 2 ) + alphabet.charAt( ( a & 3 ) << 4 | b >>> 4 ) +
			( i + 1 < bytes.length ? alphabet.charAt( ( b & 15 ) << 2 | c >>> 6 ) : '=' ) +
			( i + 2 < bytes.length ? alphabet.charAt( c & 63 ) : '=' ) );
	}
	return parts.join( '' );
}

function encodeTable( values ) { /* original values to base64 commands. */
	return encodeBase64( encodeTableBytes( values ) );
}

function encodeTableBytes( values ) { /* choose commands by total encoded cost. */
	if( !values || 'object' !== typeof values || values.length !== ( values.length >>> 0 ) || values.length >= 2147483647 )
		throw new Error( 'Invalid value array' );

	var
	 size = values.length ,previous = new Int32Array( size )
	,costs = new Float64Array( size + 1 ) ,kinds = new Uint8Array( size )
	,ends = new Uint32Array( size ) ,steps = new Int32Array( size )
	,counts = new Uint32Array( size ) ,emptyEnd = size ,last = - 1
	,i ,j ,value ,step ,count ,candidate ,best ,kind ,bestCount ,bytes ,offset = 0;

	function difference( a, b ) {
		return ( a - b + 32768 & 65535 ) - 32768;
	}

	function zigzag( value ) {
		return value < 0 ? - 2 * value - 1 : 2 * value;
	}

	function integerSize( value ) {
		return value < 128 ? 1 : value < 16384 ? 2 : value < 2097152 ? 3 : value < 268435456 ? 4 : 5;
	}

	function writeInteger( value ) {
		while( value >= 128 ) {
			bytes[ offset++ ] = ( value & 127 ) | 128;
			value >>>= 7;
		}
		bytes[ offset++ ] = value;
	}

	function writeValue( value ) {
		bytes[ offset++ ] = value >>> 8;
		bytes[ offset++ ] = value & 255;
	}

	for( i = 0; i < size; i++ ) {
		value = values[ i ];
		if( 'number' !== typeof value || value !== ( value & 65535 ) ) throw new Error( 'Invalid 16-bit value' );
		previous[ i ] = last;
		if( 65535 !== value ) last = value;
	}

	i = size;
	while( i-- ) {
		value = values[ i ];
		if( 65535 === value ) {
			count = emptyEnd - i;
			kinds[ i ] = 1;
			counts[ i ] = count;
			costs[ i ] = 1 + integerSize( count ) + costs[ emptyEnd ];
			continue;
		}
		emptyEnd = i;

		kind = 0;
		bestCount = 1;
		best = 3 + costs[ i + 1 ];
		if( previous[ i ] >= 0 ) {
			candidate = integerSize( zigzag( difference( value, previous[ i ] ) ) + 4 ) + costs[ i + 1 ];
			if( candidate < best ) {
				best = candidate;
				kind = 4;
			}
		}

		if( i + 1 < size && 65535 !== values[ i + 1 ] ) {
			step = difference( values[ i + 1 ], value );
			steps[ i ] = step;
			ends[ i ] = i + 2;
			if( i + 2 < size && 65535 !== values[ i + 2 ] && step === steps[ i + 1 ] ) ends[ i ] = ends[ i + 1 ];
			for( j = i + 3; j <= ends[ i ]; j++ ) {
				count = j - i;
				candidate = 3 + integerSize( zigzag( step ) ) + integerSize( count ) + costs[ j ];
				if( candidate < best ) {
					best = candidate;
					kind = 2;
					bestCount = count;
				}
			}
		}

		if( previous[ i ] >= 0 && ends[ i ] && difference( value, previous[ i ] ) === steps[ i ] ) {
			step = steps[ i ];
			for( j = i + 2; j <= ends[ i ]; j++ ) {
				count = j - i;
				candidate = 1 + integerSize( zigzag( step ) ) + integerSize( count ) + costs[ j ];
				if( candidate < best ) {
					best = candidate;
					kind = 3;
					bestCount = count;
				}
			}
		}
		kinds[ i ] = kind;
		counts[ i ] = bestCount;
		costs[ i ] = best;
	}

	bytes = new Uint8Array( costs[ 0 ] );
	for( i = 0; i < size; i += count ) {
		kind = kinds[ i ];
		count = counts[ i ];
		if( 4 === kind ) writeInteger( zigzag( difference( values[ i ], previous[ i ] ) ) + 4 );
		else {
			writeInteger( kind );
			if( 0 === kind || 2 === kind ) writeValue( values[ i ] );
			if( 2 === kind || 3 === kind ) writeInteger( zigzag( steps[ i ] ) );
			if( 0 !== kind ) writeInteger( count );
		}
	}
	return bytes;
}

