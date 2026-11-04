<?php

/**
* @fileoverview Grf - Load and Parse .grf files (versions 0x200 and 0x300).
* @author Vincent Thibault (alias KeyWorld - Twitter: @robrowser)
* @version 1.1.0
*/

class Grf
{

	/**
	 * @var {string} fileTable binary
	 */
	private $fileTable;


	/**
	 * @var {Array} file header
	 */
	private $header;

	/**
	 * @var {boolean} whether this GRF uses 64-bit offsets
	 */
	private $uses64BitOffsets = false;

	/**
	 * @var {int} GRF version
	 */
	private $version = 0;

	/**
	 * @var {int} archive size
	 */
	private $filesize = 0;


	/**
	 * @var {boolean} is file loaded
	 */
	public $loaded = false;


	/**
	 * @var {fp}
	 */
	protected $fp;


	/**
	 * @var {string} filename
	 */
	public $filename = '';


	/**
	 * @var {const} header size
	 */
	const HEADER_SIZE = 46;


	/**
	 * Constructor, open the filename if specify
	 *
	 * @param {string} optional filename
	 */
	public function __construct( $filename = false )
	{
		if ($filename) {
			$this->open($filename);
		}
	}


	/**
	 * Clean up memory
	 */
	public function __destruct()
	{
		if ($this->fp && is_resource($this->fp)) {
			fclose($this->fp);
		}
	}


	/**
	 * Open a file
	 *
	 * @param {string} file path
	 */
	public function open( $filename )
	{
		if (!file_exists($filename) || !is_readable($filename)) {
			Debug::write('Can\'t open GRF file "' . $filename . '"', 'error');
			return;
		}

		if (filesize($filename) < self::HEADER_SIZE) {
			Debug::write('Not enough data in GRF "'. $filename .'" to contain a valid header', 'error');
			return;
		}

		$this->filesize = filesize($filename);

		// Open it
		$this->fp   = fopen( $filename, 'r' );
	}


	/**
	 * Load the GRF
	 */
	public function load()
	{
		if (empty($this->fp)) {
			Debug::write('File "'. $this->filename .'" not opened yet', 'error');
			return;
		}

		$header = fread($this->fp, self::HEADER_SIZE);
		if ($header === false || strlen($header) !== self::HEADER_SIZE) {
			Debug::write('Can\'t read GRF header "'. $this->filename .'"', 'error');
			return;
		}

		$signature = explode("\0", substr($header, 0, 15))[0];
		$this->version = unpack('Lversion', substr($header, 42, 4))['version'];
		$this->uses64BitOffsets = $this->version === 0x300;

		if ($signature !== 'Master of Magic' && $signature !== 'Event Horizon') {
			Debug::write('Unsupported GRF signature "'. $signature .'" in "'. $this->filename .'"', 'error');
			return;
		}

		if ($this->version !== 0x200 && $this->version !== 0x300) {
			Debug::write('Unsupported GRF version 0x'. dechex($this->version) .' in "'. $this->filename .'". Supported versions are 0x200 and 0x300.', 'error');
			return;
		}

		if ($this->uses64BitOffsets && PHP_INT_SIZE < 8) {
			Debug::write('GRF 0x300 requires 64-bit PHP to read file offsets: '. $this->filename, 'error');
			return;
		}

		if ($this->uses64BitOffsets) {
			$this->header = array(
				'table_offset' => unpack('Poffset', substr($header, 30, 8))['offset'],
				'filecount' => unpack('Lfilecount', substr($header, 38, 4))['filecount']
			);
		}
		else {
			$this->header = unpack("a15signature/a15key/Ltable_offset/Lseeds/Lfilecount/Lversion", $header);
		}

		$table_offset = $this->header['table_offset'];
		if ($table_offset < 0 || $table_offset + self::HEADER_SIZE + ($this->uses64BitOffsets ? 12 : 8) > $this->filesize) {
			Debug::write('Invalid GRF file table offset in "'. $this->filename .'"', 'error');
			return;
		}

		// GRF 0x300 has an additional 4-byte field before the file table.
		if (fseek($this->fp, $table_offset + ($this->uses64BitOffsets ? 4 : 0), SEEK_CUR) !== 0) {
			Debug::write('Can\'t seek to file table in "'. $this->filename .'"', 'error');
			return;
		}

		$fileTableInfoBytes = fread($this->fp, 0x08);
		if ($fileTableInfoBytes === false || strlen($fileTableInfoBytes) !== 0x08) {
			Debug::write('Can\'t read file table header in "'. $this->filename .'"', 'error');
			return;
		}

		$fileTableInfo = unpack("Lpack_size/Lreal_size", $fileTableInfoBytes);
		if (
			$fileTableInfo['pack_size'] <= 0 ||
			$fileTableInfo['real_size'] <= 0 ||
			$fileTableInfo['pack_size'] > $this->filesize - ftell($this->fp)
		) {
			Debug::write('Invalid file table size in "'. $this->filename .'"', 'error');
			return;
		}

		$compressedFileTable = fread($this->fp, $fileTableInfo['pack_size']);
		$this->fileTable = @gzuncompress($compressedFileTable, $fileTableInfo['real_size']);

		// Extraction error
		if ($this->fileTable === false) {
			Debug::write('Can\'t extract file table in GRF "'. $this->filename .'"', 'error');
			return;
		}

		// Grf now loaded
		$this->loaded = true;
	}


	/**
	 * Search a filename
	 *
	 * @param {string} filename
	 * @param {string} content reference
	 */
	public function getFile($filename, &$content)
	{
		if (!$this->loaded) {
			return false;
		}

		// Case sensitive. faster
		$position = strpos( $this->fileTable, $filename . "\0");

		// Not case sensitive, slower...
		if ($position === false){
			$position = stripos( $this->fileTable, $filename . "\0");
		}

		// File not found
		if ($position === false) {
			Debug::write('File not found in '. $this->filename);
			return false;
		}

		// Extract file info from file list. GRF 0x300 stores 64-bit file offsets.
		$position += strlen($filename) + 1;
		$entrySize = $this->uses64BitOffsets ? 21 : 17;
		$entry = substr($this->fileTable, $position, $entrySize);
		if (strlen($entry) !== $entrySize) {
			Debug::write('Invalid file table entry for '. $filename .' in '. $this->filename, 'error');
			return false;
		}

		$fileInfo = $this->uses64BitOffsets
			? unpack('Lpack_size/Llength_aligned/Lreal_size/Cflags/Pposition', $entry)
			: unpack('Lpack_size/Llength_aligned/Lreal_size/Cflags/Lposition', $entry);

		if (($fileInfo['flags'] & 1) !== 1) {
			Debug::write('Requested path is not a file in GRF '. $this->filename);
			return false;
		}

		if ($fileInfo['flags'] !== 1) {
			Debug::write('Encrypted GRF entry is not supported: '. $filename .' in '. $this->filename, 'error');
			return false;
		}

		if (
			$fileInfo['pack_size'] <= 0 ||
			$fileInfo['real_size'] <= 0 ||
			$fileInfo['position'] < 0 ||
			$fileInfo['position'] + self::HEADER_SIZE + $fileInfo['pack_size'] > $this->filesize
		) {
			Debug::write('Invalid file entry bounds for '. $filename .' in '. $this->filename, 'error');
			return false;
		}

		// Extract file
		if (fseek($this->fp, $fileInfo['position'] + self::HEADER_SIZE, SEEK_SET) !== 0) {
			Debug::write('Can\'t seek to file '. $filename .' in '. $this->filename, 'error');
			return false;
		}

		$compressedFile = fread($this->fp, $fileInfo['pack_size']);
		if ($compressedFile === false || strlen($compressedFile) !== $fileInfo['pack_size']) {
			Debug::write('Can\'t read file '. $filename .' from '. $this->filename, 'error');
			return false;
		}

		$content = @gzuncompress($compressedFile, $fileInfo['real_size']);
		if ($content === false) {
			Debug::write('Can\'t decompress file '. $filename .' from '. $this->filename, 'error');
			return false;
		}

		Debug::write('File found and extracted from '. $this->filename, 'success');
		return true;
	}


	/**
	 * Filter
	 * Find all occurences of a string in GRF list
	 *
	 * @param {string} regex
	 */
	public function search( $regex )
	{
		$list = array();
		@preg_match_all( $regex, $this->fileTable, $matches );

		if (!empty($matches)) {
			$list = $matches[0];
			sort($list);
		}

		return $list;
	}
}