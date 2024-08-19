/* 
 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 SPDX-License-Identifier: Apache-2.0
*/
package com.amazon.solutions.druid.cloudwatch;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class MemoryBoundLinkedBlockingQueueTest {

    @Test
    public void testOfferAndTake() throws InterruptedException {
        MemoryBoundLinkedBlockingQueue.ObjectContainer<Integer> item = new MemoryBoundLinkedBlockingQueue.ObjectContainer<>(1, 4L);
        MemoryBoundLinkedBlockingQueue<Integer> queue = new MemoryBoundLinkedBlockingQueue<>(10L);
        assertTrue(queue.offer(item));
        assertEquals(1, queue.size());
        assertEquals(4L, queue.getCurrentMemory().get());
        MemoryBoundLinkedBlockingQueue.ObjectContainer<Integer> takenItem = queue.take();
        assertEquals(item.getData(), takenItem.getData());
        assertEquals(item.getSize(), takenItem.getSize());
        assertEquals(0, queue.size());
        assertEquals(0L, queue.getCurrentMemory().get());
    }

    @Test
    public void testTakeMultiple() throws InterruptedException {
        MemoryBoundLinkedBlockingQueue<Integer> queue = new MemoryBoundLinkedBlockingQueue<>(10L);
        for (int i = 0; i < 5; i++) {
            MemoryBoundLinkedBlockingQueue.ObjectContainer<Integer> item = new MemoryBoundLinkedBlockingQueue.ObjectContainer<>(i, 2L);
            assertTrue(queue.offer(item));
        }
        List<MemoryBoundLinkedBlockingQueue.ObjectContainer<Integer>> takenItems = queue.take(3);
        assertEquals(3, takenItems.size());
        assertEquals(2 * 2L, queue.getCurrentMemory().get());
        assertEquals(2, queue.size());
    }

    @Test
    public void testOfferOverMemoryBound() {
        MemoryBoundLinkedBlockingQueue<Integer> queue = new MemoryBoundLinkedBlockingQueue<>(10L);
        MemoryBoundLinkedBlockingQueue.ObjectContainer<Integer> item = new MemoryBoundLinkedBlockingQueue.ObjectContainer<>(1, 12L);
        assertFalse(queue.offer(item));
        assertEquals(0, queue.size());
        assertEquals(0L, queue.getCurrentMemory().get());
    }
}