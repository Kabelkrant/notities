<?php
declare(strict_types=1);

/** Parsedown met onderstrepen: ++tekst++ wordt <u>tekst</u>. */
final class NoteParsedown extends Parsedown
{
    public function __construct()
    {
        $this->InlineTypes['+'][] = 'Underline';
        $this->inlineMarkerList .= '+';
    }

    protected function inlineUnderline($Excerpt)
    {
        if (preg_match('/^\+\+(?=\S)(.+?)(?<=\S)\+\+/s', $Excerpt['text'], $m)) {
            return [
                'extent' => strlen($m[0]),
                'element' => [
                    'name' => 'u',
                    'handler' => ['function' => 'lineElements', 'argument' => $m[1], 'destination' => 'elements'],
                ],
            ];
        }
        return null;
    }
}
