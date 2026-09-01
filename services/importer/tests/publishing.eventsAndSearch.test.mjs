import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainEventDispatcher, EventBus, Movie } from '@ctv-platform/domain';
import {
  ContentIndexUpdateRequestedEvent,
  EventPublisher,
  SearchIndexUpdater,
} from '../dist/index.js';

test('EventPublisher dispatches an entity pending events through the real EventBus', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe((event) => received.push(event));
  const publisher = new EventPublisher(new DomainEventDispatcher(bus));

  const movie = Movie.create({ id: 'm1', title: 'Arrival' });
  movie.publish();
  publisher.publish(movie);

  assert.equal(received.length, 1);
  assert.equal(received[0].eventType, 'ContentPublished');
});

test('EventPublisher dispatches nothing for an entity with no pending events', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe((event) => received.push(event));
  const publisher = new EventPublisher(new DomainEventDispatcher(bus));

  publisher.publish(Movie.create({ id: 'm1', title: 'Arrival' }));

  assert.equal(received.length, 0);
});

test('SearchIndexUpdater publishes a ContentIndexUpdateRequestedEvent for the given content', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe((event) => received.push(event));
  const updater = new SearchIndexUpdater(bus);

  updater.requestUpdate('m1', 'movie');

  assert.equal(received.length, 1);
  assert.ok(received[0] instanceof ContentIndexUpdateRequestedEvent);
  assert.equal(received[0].contentId, 'm1');
  assert.equal(received[0].category, 'movie');
});
