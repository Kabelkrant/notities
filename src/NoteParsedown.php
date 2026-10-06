<?php
declare(strict_types=1);

/**
 * Parsedown met:
 * - onderstrepen: ++tekst++ wordt <u>tekst</u>
 * - korte linkweergave: bij automatisch herkende adressen wordt http:// of https:// in de zichtbare
 *   tekst weggelaten (de link zelf blijft volledig). Eigen linktekst, [tekst](url), blijft ongemoeid.
 */
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

    protected function inlineUrl($Excerpt)
    {
        return $this->hideScheme(parent::inlineUrl($Excerpt));
    }

    protected function inlineUrlTag($Excerpt)
    {
        return $this->hideScheme(parent::inlineUrlTag($Excerpt));
    }

    /** @param array<string,mixed>|null $inline */
    private function hideScheme(?array $inline): ?array
    {
        if ($inline !== null && isset($inline['element']['text'])) {
            $inline['element']['text'] = preg_replace('~^https?://~i', '', $inline['element']['text']);
        }
        return $inline;
    }
}
