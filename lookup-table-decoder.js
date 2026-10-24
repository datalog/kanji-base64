/**
	Kanji lookup table decoder
	lookup-table-decoder.js has no dependencies.
	https://github.com/datalog/kanji-base64
	Licensed under the MIT License.
	Copyright (c) 2026 Constantine
*/

/**
	decodeKanjiTable(base64) -> Unicode-indexed Int16Array; -1 means unsupported.
*/

'use strict';

function decodeBase64( text ) { /* base64 to bytes; atob() decodes, btoa() encodes binary strings. */

	var
	 alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	,lookup = new Int16Array( 128 )
	,bytes ,length ,padding ,bits = 0 ,buffer = 0 ,written = 0;

	if( 'string' !== typeof text || text.length % 4 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test( text ) )
		throw new Error( 'Invalid base64' );

	length = text.length;
	padding = '=' === text.charAt( length - 2 ) ? 2 : '=' === text.charAt( length - 1 ) ? 1 : 0;
	bytes = new Uint8Array( length / 4 * 3 - padding );
	var i = 64;
	while( i-- ) lookup[ alphabet.charCodeAt( i ) ] = i;
	for( i = 0; i < length - padding; i++ ) {
		buffer = buffer << 6 | lookup[ text.charCodeAt( i ) ];
		bits += 6;
		if( bits >= 8 ) {
			bits -= 8;
			bytes[ written++ ] = buffer >>> bits & 255;
			buffer &= ( 1 << bits ) - 1;
		}
	}
	if( buffer ) throw new Error( 'Invalid base64 padding' );
	return bytes;
}

function decodeKanjiTable( text ) { /* base64 commands to unicode -> qr kanji. */

	var
	 bytes = decodeBase64( text )
	,table = new Int16Array( 65536 )
	,offset = 0 ,index = 0 ,previous = - 1
	,token ,value ,step ,count ,encoded ,i = table.length;

	while( i-- ) table[ i ] = - 1;

	function readInteger() { /* unsigned, canonical varint; at most three bytes. */
		var result = 0 ,shift = 0 ,byte;
		do {
			if( offset >= bytes.length || shift > 14 ) throw new Error( 'Invalid kanji varint' );
			byte = bytes[ offset++ ];
			result |= ( byte & 127 ) << shift;
			shift += 7;
		} while( byte & 128 );
		if( shift > 7 && !byte ) throw new Error( 'Non-canonical kanji varint' );
		return result;
	}

	function readValue() { /* big-endian unicode value. */
		if( offset + 2 > bytes.length ) throw new Error( 'Truncated kanji value' );
		var result = bytes[ offset++ ] << 8 | bytes[ offset++ ];
		if( 65535 === result ) throw new Error( 'Reserved kanji value' );
		return result;
	}

	while( offset < bytes.length ) {
		token = readInteger();
		if( 1 === token ) {
			count = readInteger();
			if( !count || index + count > 8192 ) throw new Error( 'Invalid kanji empty run' );
			index += count;
			continue;
		}

		step = 0;
		count = 1;
		if( 0 === token ) value = readValue();
		else if( 2 === token || 3 === token ) {
			if( 2 === token ) value = readValue();
			else {
				if( previous < 0 ) throw new Error( 'Missing kanji reference' );
				value = previous;
			}
			encoded = readInteger();
			if( encoded > 65535 ) throw new Error( 'Invalid kanji step' );
			step = ( encoded >>> 1 ) ^ - ( encoded & 1 );
			count = readInteger();
			if( count < ( 2 === token ? 3 : 2 ) ) throw new Error( 'Invalid kanji series' );
			if( 3 === token ) value = value + step & 65535;
		} else {
			if( previous < 0 || token > 65539 ) throw new Error( 'Invalid kanji delta' );
			encoded = token - 4;
			value = previous + ( ( encoded >>> 1 ) ^ - ( encoded & 1 ) ) & 65535;
		}

		if( index + count > 8192 ) throw new Error( 'Kanji table overflow' );
		while( count-- ) {
			if( 65535 === value || - 1 !== table[ value ] ) throw new Error( 'Invalid or duplicate kanji value' );
			table[ value ] = index++;
			previous = value;
			value = value + step & 65535;
		}
	}

	if( 8192 !== index ) throw new Error( 'Incomplete kanji table' );
	return table;
}

