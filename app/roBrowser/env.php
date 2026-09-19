<?php
header('Content-Type: application/javascript; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

$rathenaHost = getenv('RATHENA_HOST');
if (!$rathenaHost || $rathenaHost === '0.0.0.0') {
    $rathenaHost = '';
}
$webPort = getenv('WEB_PORT') ?: '8080';
$wsproxyPort = getenv('WSPROXY_PORT') ?: '5999';
$loginPort = (int)(getenv('LOGIN_PORT') ?: 6900);
$packetver = (int)(getenv('PACKETVER') ?: 20141022);

$config = [
    'RATHENA_HOST' => $rathenaHost,
    'WEB_PORT' => $webPort,
    'WSPROXY_PORT' => $wsproxyPort,
    'LOGIN_PORT' => $loginPort,
    'PACKETVER' => $packetver
];

echo 'window.RO_ENV = ' . json_encode($config) . ';' . PHP_EOL;
