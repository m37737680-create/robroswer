<?php if (!defined('FLUX_ROOT')) exit; ?>

<section class="roita-home">
	<div class="roita-hero">
		<p class="roita-eyebrow">Ragnarok Online</p>
		<h1>Benvenuti su Roita!</h1>
		<p class="roita-intro">Crea il tuo account e tuffati nell'avventura: non devi installare nulla, puoi giocare direttamente dal browser.</p>
		<div class="roita-actions">
			<a class="roita-button roita-button-primary" href="<?php echo htmlspecialchars($this->url('account', 'create'), ENT_QUOTES, 'UTF-8') ?>">Registrati per iniziare</a>
			<?php if ($gameUrl): ?>
				<a class="roita-button roita-button-secondary" href="<?php echo htmlspecialchars($gameUrl, ENT_QUOTES, 'UTF-8') ?>">Gioca da desktop</a>
			<?php endif; ?>
		</div>
		<?php if (!$gameUrl): ?>
			<p class="roita-config-notice">Il link al gioco non è configurato. Imposta CLIENT_PUBLIC_HOST nel file .env per abilitarlo.</p>
		<?php endif; ?>
	</div>

	<div class="roita-home-grid">
		<article class="roita-card">
			<span class="roita-card-icon" aria-hidden="true">⌨</span>
			<h2>Gioca da computer</h2>
			<p>Registrati e premi il pulsante qui sopra. Si aprirà il gioco nel browser, senza download o installazioni.</p>
		</article>
		<article class="roita-card">
			<span class="roita-card-icon" aria-hidden="true">📱</span>
			<h2>Gioca da mobile</h2>
			<p>Apri lo stesso link del gioco da Safari su iPhone/iPad oppure da Chrome su Android:</p>
			<?php if ($gameUrl): ?>
				<p><a class="roita-game-link" href="<?php echo htmlspecialchars($gameUrl, ENT_QUOTES, 'UTF-8') ?>"><?php echo htmlspecialchars($gameUrl, ENT_QUOTES, 'UTF-8') ?></a></p>
			<?php endif; ?>
			<ol class="roita-steps">
				<li><strong>iPhone e iPad:</strong> in Safari tocca il pulsante <em>Condividi</em>, scorri le opzioni e scegli <em>Aggiungi alla schermata Home</em>.</li>
				<li><strong>Android:</strong> in Chrome apri il menu con i tre puntini e scegli <em>Aggiungi a schermata Home</em> o <em>Installa app</em>.</li>
			</ol>
			<p>L'icona di Roita apparirà sulla schermata Home: toccala per tornare a giocare.</p>
		</article>
	</div>
</section>

<?php if(Flux::config('CMSNewsOnHomepage')): ?>
	<?php if($newstype == '1'):?>
		<?php if($news): ?>
			<div class="newsDiv">
			<?php foreach($news as $nrow):?>
				<h4><?php echo $nrow->title ?></h4>
				<div class="newsCont">
					<span class="newsDate"><small>by <?php echo $nrow->author ?> on <?php echo date(Flux::config('DateFormat'),strtotime($nrow->created))?></small></span>
					<p><?php echo $nrow->body ?></p>
					<?php if($nrow->created != $nrow->modified && Flux::config('CMSDisplayModifiedBy')):?>
						<small><?php echo htmlspecialchars(Flux::message('CMSModifiedLabel')) ?> : <?php echo date(Flux::config('DateFormat'),strtotime($nrow->modified))?></small>
					<?php endif; ?>
					<?php if($nrow->link): ?>
						<a class="news_link" href="<?php echo $nrow->link ?>"><small><?php echo htmlspecialchars(Flux::message('CMSNewsLink')) ?></small></a>
						<div class="clear"></div>
					<?php endif; ?>
				</div>
			<?php endforeach; ?> 
			</div>
		<?php else: ?>
			<p><?php echo htmlspecialchars(Flux::message('CMSNewsEmpty')) ?></p>
		<?php endif ?>

	<?php elseif($newstype == '2'):?>
		<?php if(isset($xml) && isset($xml->channel)): ?>
		<div class="newsDiv">
			<?php foreach($xml->channel->item as $rssItem): ?>
				<?php $i++; if($i <= $newslimit): ?>
					<h2><?php echo $rssItem->title ?></h2>
					<div class="newsCont">
						<span class="newsDate"><small>Posted on <?php echo date(Flux::config('DateFormat'),strtotime($rssItem->pubDate))?></small></span>
						<p><?php echo $rssItem->description ?></p>
						<a class="news_link" href="<?php echo $rssItem->link ?>"><small><?php echo htmlspecialchars(Flux::message('CMSNewsLink')) ?></small></a>
						<div class="clear"></div>
					</div>
				<?php endif ?>
			<?php endforeach; ?> 
		</div>
		<?php else: ?>
			<p>
				<?php echo htmlspecialchars(Flux::message('CMSNewsRSSNotFound')) ?><br/><br/>
			</p>
		<?php endif ?>
	<?php endif ?>




<?php endif ?>
